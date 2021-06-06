// api bridge for ha devices added in houmio
import * as Hapi from "hapi"
import * as request from "request"
require('log-timestamp')

const server = new Hapi.Server({
  port: 3003
});

const macIp = "localhost"

const HA_KEY = ""

const init = async () => {
  await server.start();
  console.log(`Server running at: ${server.info.uri}`);
};

server.route({
  method: "POST",
  path: "/{id}",
  handler: async (req, h) => {
    try{
      console.log(JSON.stringify(req.payload))
      // { command:"set", state: { on:false, bri:122 } }
      const payload = req.payload as {
        command: "set"
        state: {
          on: boolean
          bri?: number
        }
      }
      const id = req.params.id

      if(!(req.payload && payload.state && typeof payload.state.on === "boolean" && id)){
        console.log("incoming data is invalid:", req.payload)
        return h.response().code(400)
      }

      const status = await new Promise<number>((resolve) => {
        const action = payload.state.on ? "turn_on" : "turn_off"
        const body = {
          entity_id: id,
          ...payload.state.on && !id.includes("switch") ? {brightness: payload.state.bri} : {}
        }
        console.log(id, action, body, req.payload)
        
        request({
          method: "POST",
          uri: `https://${macIp}:8123/api/services/homeassistant/${action}`,
          headers: {
            'Authorization': `Bearer ${HA_KEY}`, 
            'Content-Type': 'application/json'
          },
          json: true,
          body,
          rejectUnauthorized: false
          // requestCert: true
          // agent: false
        }, (err, httpResponse, hassBody) => {
          console.log('hass response:', err, httpResponse.statusCode)
          if (err || !httpResponse || httpResponse.statusCode !== 200) {
            console.error(hassBody)
            return resolve(500)
          }
          return resolve(200)
        })
      })

      return h.response().code(status)
    }
    catch(err){
      console.error("error:", err, err.stack)
      return h.response().code(500)
    }
  }
})

process.on('unhandledRejection', (err: Error) => {
  console.log("error", err, err.stack);
  process.exit(1);
})
process.on('uncaughtException', (err: Error) => {
  console.error("error", err, err.stack)
})

init()
