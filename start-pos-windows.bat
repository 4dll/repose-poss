@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  npm install
)

if not exist dist (
  npm run build
)

start "" http://localhost:3002
npm start
