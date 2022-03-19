const io = require('socket.io-client')
const util = require('util');
const request = require('request')
const R = require("ramda")
const express = require('express')
const app = express()
app.use(express.json())

require('log-timestamp')
console.log("starting....")

const post = util.promisify(request.post)
const get = util.promisify(request.get)

const HA_KEY = process.env.SUPERVISOR_TOKEN
const SITEKEY = process.env.MOUNTKELVIN_KEY
const MOUNTKELVIN_BRIDGE_KEY = process.env.MOUNTKELVIN_BRIDGE_KEY
console.log(`HA_KEY: '${HA_KEY}', SITEKEY: '${SITEKEY}'`)
if(!HA_KEY){
  console.error("missing HA_KEY")
  process.exit(1)
}
if(!SITEKEY){
  console.error("missing MOUNTKELVIN_KEY")
  process.exit(1)
}


const commonRequestParams = {
  headers: {'Authorization': `Bearer ${HA_KEY}`, 'Content-Type': 'application/json'},
  json: true,
  rejectUnauthorized: false,
  requestCert: true,
  agent: false
}

const port = 4003

let siteDevices = []

app.get('/', (_req, res) => {
  res.send(siteDevices)
})
app.get('/:id', (req, res) => {
  res.send(siteDevices.find(d => d.id === req.params.id))
})

app.post('/houmio/:id', async (req, res) => {
  try{
    const key = req.query.key
    if(key !== MOUNTKELVIN_BRIDGE_KEY){
      console.log(`invalid key ${key}, expected ${MOUNTKELVIN_BRIDGE_KEY}`)
      return res.status(401).send()
    }

    // { command:"set", state: { on:false, bri:122 } }
    const payload = req.body
    const id = req.params.id

    if(!(payload && payload.state && typeof payload.state.on === "boolean" && id)){
      console.log("incoming data is invalid:", payload, id)
      return res.status(400).send()
    }

    const status = await new Promise((resolve) => {
      const action = payload.state.on ? "turn_on" : "turn_off"
      const body = {
        entity_id: id,
        ...payload.state.on && !id.includes("switch") ? {brightness: payload.state.bri} : {}
      }
      console.log(id, action, body, payload)
      
      post({
        url: `http://supervisor/core/api/services/homeassistant/${action}`,
        ...commonRequestParams,
        body,
      }, (err, httpResponse, hassBody) => {
        console.log('hass response:', err, httpResponse?.statusCode)
        if (err || !httpResponse || httpResponse.statusCode !== 200) {
          console.error("error body: ", hassBody)
          return resolve(500)
        }
        return resolve(200)
      })
    })

    return res.status(status).send()
  }
  catch(err){
    console.error("error:", err, err.stack)
    return res.status(500).send()
  }
})

app.listen(port, () => console.log(`app listening on port ${port}!`))

const getState = async id => {
  const response = await get({
    url: `http://supervisor/core/api/states/${id}`,
    ...commonRequestParams
  })
  return response.body
}

const setState = async (id, state) => {
  return post({
    url: `http://supervisor/core/api/states/${id}`,
    ...commonRequestParams,
    body: state,
  })
}

process.on("unhandledRejection", (reason) => console.error("unhandledRejection", reason))
process.on("uncaughtException", (err) => console.error("uncaughtException", err))

const onSite = ({ data }) => {
  if(!(data && data.devices)){
    console.error("invalid site:", data)
    return
  }
  const houmioDevices = data.devices
    .filter(d => d.manufacturer !== "custom")
    .map(d => ({...d, hassId: d.id.replace(/-/g, "")}))

  const changed = houmioDevices.filter(d => {
    const old = siteDevices.find(s => s.id === d.id)
    return !old || old && !R.equals(d, old)
  })
  siteDevices = houmioDevices

  console.log("changed:", changed.length)
  changed.forEach(d => {
    const address = d.driverId && d.driverId.address
    if(!address){
      console.log("invalid device", d)
      return
    }
    const hassId = `light.${d.id}`.replace(/-/g, "")
    getState(hassId).then(state => {
      const hasBrightness = state.attributes && (state.attributes.brightness && d.type === "dimmable" || state.attributes.supported_features === 33)
      const attributes = hasBrightness ? {...state.attributes, brightness: d.state.bri} : state.attributes
      const body = {...state, state: d.state.on === true ? "on" : "off", attributes}
      // console.log("change", hassId, body, hasBrightness, "houmio data:", d)
      console.log("change", hassId)
      return setState(hassId, body)
    }).catch(err => {
      console.error("setState error:", err)
    })
  })
}

let reconnectIntervalId
const createSocket = () => {
  const socket = io.connect('https://houmkolmonen.herokuapp.com', {
    reconnectionDelay: 1000,
    reconnectionDelayMax: 3000,
    transports: ['websocket']
  })

  const onConnect = () => {
    clearInterval(reconnectIntervalId)
    socket.emit('subscribe', { siteKey: SITEKEY })
  }

  socket.on('siteKeyFound', ({ siteKey, data }) => console.log('siteKeyFound', data))
  socket.on('noSuchSiteKey', ({ siteKey }) => console.log('noSuchSiteKey'))
  socket.on('siteKeyExpired', ({ siteKey }) => console.log('siteKeyExpired'))
  socket.on('connect_error', (error) => console.error('connect_error', error))
  socket.on('reconnect_error', (error) => console.error('reconnect_error', error))
  socket.on('error', (error) => console.error('error', error))
  socket.on('connect_timeout', (error) => console.error('connect_timeout', error))
  socket.on('reconnect', () => {
    console.log('reconnected')
    onConnect()
  })
  socket.on('connect', () => {
    console.log('connected')
    onConnect()
  })

  socket.on('site', onSite)

  socket.on('offline', ({ siteKey }) => {
    console.log('offline')
    socket.off()
    socket.disconnect()

    reconnectIntervalId = setTimeout(() => {
      createSocket()
    }, 10000)
  })
}

createSocket()

/*
socket.on('peripheralInput', ({ siteKey, data }) => {
  console.log("peripheralInput--", data)
  const direction = data.accidental === 'sharp' ? 'up' : 'down'
  const buttonGroup = buttons[data.driverId.address]
  const service = "light"
  
  const button = buttonGroup ? buttonGroup[`${data.key}_${direction}`] : null
  console.log("button:", button)
  if(button){
    const {service, action, id} = button
    request.post({
      url: `http://docker.for.mac.localhost:8123/api/services/${service}/${action}`,
      headers: {'x-ha-access': HA_KEY},
      json: true,
      body: {entity_id: id}
    }, (err, httpResponse, body) => {
      if (err) {
        return console.error('upload failed:', err)
      }
      console.log('Server responded with:', body)
    })
  }
})
*/
