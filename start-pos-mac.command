#!/bin/zsh
cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
  npm install
fi

if [ ! -d dist ]; then
  npm run build
fi

open http://localhost:3002
npm start
