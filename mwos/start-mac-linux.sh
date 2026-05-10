#!/bin/bash
echo ""
echo "=========================================="
echo " TMC Copino MWOS - Starting All Services"
echo "=========================================="
echo ""

# Backend
echo "[1/3] Starting Backend..."
cd backend && npm install && npm run dev &
BACKEND_PID=$!
sleep 5

# Frontend
echo "[2/3] Starting Frontend..."
cd ../frontend && npm install && npm run dev &
FRONTEND_PID=$!
sleep 3

# Mobile
echo "[3/3] Starting Mobile (Expo)..."
cd ../mobile && npm install --legacy-peer-deps && npx expo start --android &
MOBILE_PID=$!

echo ""
echo "=========================================="
echo " All services started!"
echo " Backend:  http://localhost:5000"
echo " Frontend: http://localhost:3000"
echo " Mobile:   Expo DevTools"
echo "=========================================="
echo ""
echo "Demo Accounts:"
echo "  Admin:   admin@tmccopino.com / admin1234"
echo "  Doctor:  doctor@tmccopino.com / password123"
echo "  Midwife: midwife@tmccopino.com / password123"
echo "  Patient: patient@example.com / patient123"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $BACKEND_PID $FRONTEND_PID $MOBILE_PID; exit" SIGINT
wait
