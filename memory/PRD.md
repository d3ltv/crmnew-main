# CRM Apple-Inspiré — Product Requirements Document

## Original problem statement
CRM interne, simple mais complet, pensé comme si Apple l'avait designé. Gère plusieurs "espaces" indépendants (ex: "Avocats", "BTP"), chacun avec son propre tableau Kanban, ses leads et ses colonnes. Application React uniquement, en mémoire (pas de localStorage / sessionStorage / backend), design HIG Apple : Clarity, Deference, Depth, Consistency. Light + dark mode, desktop en priorité.

## User choices confirmed
- Persistance : 100% en mémoire React (état perdu au refresh — voulu MVP)
- Mode : Light par défaut avec toggle dark
- Démarrage : vide avec onboarding
- Carte Kanban : entreprise + tel + site + petit indicateur de tag discret

## Architecture
- 100% frontend React (aucun backend utilisé)
- État global via `useReducer` dans `CrmProvider` (context)
- Drag & drop natif HTML5 (leads entre colonnes + réordonnancement colonnes)
- shadcn/ui pour dialogs, alert-dialogs, inputs, dropdowns, selects
- `sonner` pour les toasts (undo suppression style Gmail)
- CSV parser custom (RFC 4180-ish) dans `lib/csvUtils.js`

## Composants clés
- `App.js` — routing conditionnel (WorkspacesPage ↔ WorkspacePage) + Toaster
- `context/CrmContext.jsx` — reducer complet (workspaces, columns, leads, notes, undo)
- `components/WorkspacesPage.jsx` — onboarding + grille cartes espaces
- `components/WorkspacePage.jsx` — vue Kanban (sidebar + topbar + board + panel + import)
- `components/Sidebar.jsx` — switcher espaces
- `components/TopBar.jsx` — search + import + export CSV + theme toggle + new lead
- `components/KanbanBoard.jsx` — colonnes, drag&drop natif, filtre
- `components/KanbanColumn.jsx` — titre inline éditable (double-clic), drop target
- `components/LeadCard.jsx` — carte (entreprise / tel / site + puce tag)
- `components/LeadDetailPanel.jsx` — panneau latéral (fields, tags, notes, next action, delete)
- `components/CsvImportModal.jsx` — wizard 2 étapes (upload → mapping+aperçu)
- `components/CreateWorkspaceDialog.jsx`, `EmptyState`, `ThemeToggle`
- `lib/csvUtils.js` — parseCsv, autoDetectMapping, rowsToLeads, leadsToCsv

## Modèle de données
- `Workspace = { id, name, sector, columns: {[id]: {id, name}}, columnOrder: [id], leads: {[id]: Lead}, createdAt }`
- `Lead = { id, columnId, company, phone, website, email, contact, tags: [str], notes: [{id, text, at}], nextAction: {date, label}|null, lastContact, extra: {}, createdAt, archived }`
- État global `{ workspaces, order, currentId, theme, lastDeleted }`

## Implémenté (2026-02) — MVP complet
- Espaces multiples cloisonnés, création/suppression avec confirmation
- Onboarding hero + grille cartes espaces (aperçu colonnes + compteur leads)
- Kanban : 6 colonnes par défaut, ajout/suppression/renommage inline, réordonnancement drag & drop
- Cartes leads draggables entre colonnes (HTML5 natif)
- Panneau détail lead : édition en direct, tags avec dot coloré déterministe, historique notes horodatées, prochaine action avec date, sélecteur de statut
- Suppression lead avec toast undo (sonner, style Gmail, 6s)
- Recherche/filtre instantané par entreprise/tel/tag
- Import CSV : dropzone + upload, auto-detect mapping FR (société, téléphone, site, email), aperçu 3 lignes, gestion « Sans nom — à compléter »
- Export CSV symétrique
- Dark mode toggle (classe `.dark` sur `<html>`)
- Compteurs de leads visibles en permanence (sidebar + colonnes)
- États vides soignés partout
- Design tokens conformes HIG (systemBlue #007AFF, grille 8px, radius 12-16, font -apple-system, blur glass sur nav/topbar, shadows subtils sur cartes)

## Backlog / next
- P1 : archivage lead (soft-delete) séparé de la suppression dure
- P1 : templates de colonnes par secteur (avocats / BTP / SaaS) au setup
- P2 : filtres avancés (par statut, tag combiné)
- P2 : rappels visuels quand `nextAction.date` est dépassée
- P2 : responsive mobile (< 640px) — actuellement tablette+ ok
- P2 : persistance optionnelle via backend/MongoDB (upgrade au-delà du MVP)
