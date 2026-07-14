# CRM — Application web fullstack

CRM Kanban fullstack avec React + FastAPI + MongoDB.

## Stack

| Couche | Tech |
|--------|------|
| Frontend | React 19, Tailwind CSS, shadcn/ui |
| Backend | FastAPI (Python) |
| Base de données | MongoDB via Motor |
| Auth | JWT (email + mot de passe) |

---

## Démarrage rapide

### Prérequis

- Node.js ≥ 18 + yarn
- Python ≥ 3.11
- MongoDB (local ou Atlas)

---

### 1. Backend

```bash
cd backend

# Copier et remplir les variables d'environnement
cp .env.example .env
# Modifier MONGO_URL, DB_NAME, JWT_SECRET dans .env

# Installer les dépendances
pip install -r requirements.txt

# Lancer le serveur
uvicorn server:app --reload --port 8000
```

L'API sera disponible sur `http://localhost:8000/api`.

---

### 2. Frontend

```bash
cd frontend

# Copier et remplir les variables d'environnement
cp .env.example .env.local
# REACT_APP_API_URL=http://localhost:8000 (déjà défini)

# Installer les dépendances
yarn install

# Lancer l'app
yarn start
```

L'app sera disponible sur `http://localhost:3000`.

---

## Architecture

```
crmnew-main/
├── backend/
│   ├── server.py          # FastAPI — auth JWT + endpoints CRM state
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.js             # Root — orchestre auth + chargement state
    │   ├── context/
    │   │   ├── AuthContext.jsx  # Auth JWT (login/register/logout)
    │   │   └── CrmContext.jsx   # State CRM + sync serveur debounced
    │   ├── lib/
    │   │   └── api.js          # Client axios (auth + crm endpoints)
    │   └── components/
    │       ├── AuthPage.jsx     # Écran login / inscription
    │       └── ...              # Composants CRM existants
    └── .env.example
```

## Fonctionnalités

- **Authentification** — inscription et connexion par email/mot de passe
- **Sync serveur** — données sauvegardées en MongoDB, synchronisation automatique (debounced 1.5s)
- **Fallback localStorage** — si le serveur est indisponible, l'app continue de fonctionner hors ligne
- **Kanban** — colonnes drag-and-drop, réordonnancement des cartes
- **4 vues** — Kanban, Liste, Table, Pipeline
- **Leads** — création, édition, notes, valeur du deal, relances automatiques
- **Import CSV** — importation de leads depuis un fichier CSV
- **Multi-workspace** — plusieurs pipelines par utilisateur
- **Thème** — dark / light mode
- **Undo** — Cmd+Z annule la dernière action
