#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================="
echo "  Deploying FEP IITK on VM"
echo "=========================================="

echo "--> Pulling latest code from GitHub..."
git pull origin main

echo "--> Installing root and frontend dependencies..."
npm install

echo "--> Installing backend dependencies..."
cd server
npm install
cd ..

echo "--> Building production frontend..."
npm run build

echo "--> Starting / Restarting server with PM2..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe fep-portal > /dev/null 2>&1; then
    pm2 restart fep-portal
  else
    pm2 start server/index.js --name "fep-portal"
  fi
  pm2 save
  echo "--> PM2 process status:"
  pm2 status fep-portal
else
  echo "WARNING: PM2 is not installed globally. Install it with: sudo npm install -g pm2"
  echo "You can start the server manually with: npm run server"
fi

echo "=========================================="
echo "  Deployment completed successfully!"
echo "=========================================="

