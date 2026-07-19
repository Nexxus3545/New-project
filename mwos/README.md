# MWOS Complete System

Unified multi-platform Maternal Wellness and Operation System (MWOS) for:
- Web frontend (React + Tailwind)
- Backend API (Node.js + Express + PostgreSQL)
- Mobile app (React Native + Expo)
- Desktop app (Electron)

All clients connect to the same backend and database.

## Quick Links
- Complete package documentation: `docs/COMPLETE_SYSTEM_PACKAGE.md`
- Production-ready architecture spec: `docs/MWOS_PRODUCTION_READY_ARCHITECTURE.md`
- Implementation backlog: `docs/MWOS_IMPLEMENTATION_BACKLOG.md`
- RBAC and security implementation plan: `docs/MWOS_RBAC_SECURITY_IMPLEMENTATION_PLAN.md`
- API docs (after backend start): `http://localhost:5000/api/docs`
- Postman collection: `postman/MWOS_Complete.postman_collection.json`

## Run (Docker)
```bash
docker compose up --build
```

## Run (Manual)
1. `cd backend && npm install && npm run migrate && npm run seed && npm run dev`
2. `cd frontend && npm install && npm run dev`
3. `cd mobile && npm install --legacy-peer-deps && npx expo start`
4. `cd desktop && npm install && npm run dev`
