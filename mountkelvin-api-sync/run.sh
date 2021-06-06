#!/usr/bin/with-contenv bashio
set +u

export HA_KEY=$(bashio::config 'ha_key')
export MOUNTKELVIN_KEY=$(bashio::config 'mountkelvin_key')
bashio::log.info "HA_KEY configured as ${HA_KEY}."
bashio::log.info "MOUNTKELVIN_KEY configured as ${MOUNTKELVIN_KEY}."

bashio::log.info "Starting bridge service."
npm run start