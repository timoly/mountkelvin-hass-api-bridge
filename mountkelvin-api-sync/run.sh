#!/usr/bin/with-contenv bashio
set +u

export MOUNTKELVIN_KEY=$(bashio::config 'mountkelvin_key')
bashio::log.info "MOUNTKELVIN_KEY configured as ${MOUNTKELVIN_KEY}."

bashio::log.info "Starting bridge service."
npm run start