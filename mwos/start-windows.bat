@echo off
echo.
echo ==========================================
echo  TMC Copino MWOS - Starting All Services
echo ==========================================
echo.

echo [1/3] Starting Backend...
start "MWOS Backend" cmd /k "cd backend && npm install && npm run dev"
timeout /t 5 /nobreak >nul

echo [2/3] Starting Frontend...
start "MWOS Frontend" cmd /k "cd frontend && npm install && npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] Starting Mobile (Expo)...
start "MWOS Mobile" cmd /k "cd mobile && npm install --legacy-peer-deps && npx expo start --android"

echo.
echo ==========================================
echo  Services starting in separate windows!
echo  Backend:  http://localhost:5000
echo  Frontend: http://localhost:3000
echo  Mobile:   Expo DevTools
echo ==========================================
echo.
echo Demo Accounts:
echo   Admin:   admin@tmccopino.com / admin1234
echo   Doctor:  doctor@tmccopino.com / password123
echo   Midwife: midwife@tmccopino.com / password123
echo   Patient: patient@example.com / patient123
echo.
pause
