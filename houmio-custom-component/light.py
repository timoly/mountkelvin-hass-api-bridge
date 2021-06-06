
import logging
import threading
import time
import requests
import json

from homeassistant.helpers.aiohttp_client import async_get_clientsession
import async_timeout

from urllib3.exceptions import HTTPError

import asyncio
import aiohttp
from functools import partial
import math
import os

from homeassistant.components.light import (ATTR_BRIGHTNESS, ATTR_TRANSITION,
    Light, SUPPORT_BRIGHTNESS, SUPPORT_FLASH, SUPPORT_TRANSITION)

DOMAIN = 'light_houmio_v3'
LIGHT_BINARY = (SUPPORT_FLASH)
LIGHT_BRIGHTNESS = (SUPPORT_BRIGHTNESS | SUPPORT_TRANSITION)
TRANSITION_INTERVAL = 5

_LOGGER = logging.getLogger(__name__)

HOUMIO_URL = 'https://houmkolmonen.herokuapp.com/api/site'
API_GW_URL = 'http://localhost:4003'

class HoumioLight(Light):
    """Representation of an Houmio Light."""

    def __init__(self, light, siteKey):
        """Initialize an HoumioLight."""
        _LOGGER.info("__init__ houmio light: {0}".format(light))
        self._light = light
        self._light['houmio_id'] = light['id']
        self._light['id'] = light['hassId']
        self._transitionInterval = None
        self._siteKey = siteKey

    @property
    def should_poll(self):
        return False

    @property
    def unique_id(self):
        """Return the ID of this light."""
        return self._light['id']

    @property
    def name(self):
        """Return the display name of this light."""
        return self._light['id']

    @property
    def brightness(self):
        """Brightness of the light (an integer in the range 1-255)."""
        return None if self._light['type'] == 'binary' else self._light['state']['bri']

    @property
    def supported_features(self):
        """Flag supported features."""
        return LIGHT_BINARY if self._light['type'] == 'binary' else LIGHT_BRIGHTNESS

    @property
    def is_on(self):
        """Return true if light is on."""
        return self._light['state']['on'] == 1

    def applyDevice(self, key, id, state):
        payload = {'id': id, 'state': state}
        url = "{0}/{1}/applyDevice".format(HOUMIO_URL, key)
        headers = {'Content-Type': 'application/json'}
        r = requests.post(url, data=json.dumps(payload), headers=headers)
        _LOGGER.info("applyDevice: {0} {1} {2} {3}".format(r, url, id, state))

    def turn_off(self, **kwargs):
        """Instruct the light to turn off."""
        _LOGGER.info("turn off: {0} {1}".format(kwargs, self._light))
        self._light['state']['on'] = False

        if self._transitionInterval is not None:
            self._transitionInterval.cancel()

        if ATTR_TRANSITION in kwargs:
            transitionCount = math.ceil(kwargs[ATTR_TRANSITION] / TRANSITION_INTERVAL)
            step = self.step(transitionCount)
            bound_transition_down = partial(self.transition_down, step)
            self._transitionInterval = setInterval(bound_transition_down, TRANSITION_INTERVAL)
        else:
            self.applyDevice(self._siteKey, self._light['houmio_id'], {'on': False})

    def turn_on(self, **kwargs):
        _LOGGER.info("turn on: {0} {1}".format(kwargs, self._light))
        self._light['state']['on'] = True
        if ATTR_BRIGHTNESS in kwargs:
            self._light['state']['bri'] = kwargs.get(ATTR_BRIGHTNESS)

        if self._transitionInterval is not None:
            self._transitionInterval.cancel()

        if ATTR_TRANSITION in kwargs:
            transitionCount = math.ceil(kwargs[ATTR_TRANSITION] / TRANSITION_INTERVAL)
            step = self.step(transitionCount)
            bound_transition_up = partial(self.transition_up, step)
            self._transitionInterval = setInterval(bound_transition_up, TRANSITION_INTERVAL)
        else:
            data = {'on': True, 'bri': kwargs.get(ATTR_BRIGHTNESS)} if ATTR_BRIGHTNESS in kwargs else {'on': True}
            _LOGGER.info("turn foo: {0} {1}".format(data, self._light['state']['bri']))
            
            self.applyDevice(self._siteKey, self._light['houmio_id'], data)

    def step(self, transitionCount):
        return math.ceil(self._light['state']['bri'] / transitionCount)

    def transition_down(self, step):
        if self._light['state']['bri'] <= 0 or self._light['state']['on'] is False:
            self._transitionInterval.cancel()
            return

        bri = self._light['state']['bri'] - step
        self.applyDevice(self._siteKey, self._light['houmio_id'], {'bri': bri if bri >= 0 else 0, 'on': True if bri >= 0 else False})

        if bri <= 0:
            self._transitionInterval.cancel()

    def transition_up(self, step):
        if self._light['state']['bri'] >= 255 and self._light['state']['on'] is True:
            self._transitionInterval.cancel()
            return

        bri = self._light['state']['bri'] + step if self._light['state']['on'] is True else step

        self.applyDevice(self._siteKey, self._light['houmio_id'], {'bri': bri if bri <= 255 else 255, 'on': True})

        if bri >= 255:
            self._transitionInterval.cancel()

    @asyncio.coroutine
    def async_update(self):
        url = "{0}/{1}".format(API_GW_URL, self._light['houmio_id'])
        _LOGGER.info("houmio async_update: {0} {1}".format(self._light, url))

async def fetch(hass, url, method='get'):
    session = async_get_clientsession(hass)
    try:
        with async_timeout.timeout(30, loop=hass.loop):
            resp = await session.get(url)
            return (await resp.json()) if resp.status == 200 else (await resp.release())
    except (asyncio.TimeoutError, aiohttp.ClientError):
        _LOGGER.error("Timeout for houmio fetch.")
        return None

async def fetchLights(hass, siteKey):
    data = await fetch(hass, API_GW_URL)
    if data is None:
        _LOGGER.error('Could not connect to API_GW')
        return False
    return data

async def async_setup_platform(hass, config, async_add_devices, discovery_info=None):
    """Setup the Houmio v3 Light platform."""

    siteKey = config.get('sitekey')
    haKey = config.get('haKey')

    if siteKey is None:
        _LOGGER.error('sitekey is required')
        return False

    lights = await fetchLights(hass, siteKey)

    if lights is False:
        return False

    lights = [HoumioLight(light, siteKey) for light in lights]
    _LOGGER.info("lights: {0}".format(lights))

    async_add_devices(lights, True)
    return True

class setInterval():
    def __init__(self, func, sec):
        def func_wrapper():
            self.t = threading.Timer(sec, func_wrapper)
            self.t.start()
            func()
        self.t = threading.Timer(sec, func_wrapper)
        self.t.start()

    def cancel(self):
        self.t.cancel()
