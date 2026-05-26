# Restaurante Cerro — Project Context

## Overview

Web application for managing daily "menú del día" orders at a Peruvian restaurant.
Customers browse and order from their phones; orders flow through cashier confirmation
and then to the kitchen display. No user accounts, no online payments.

## Stack

| Layer | Technology |
|---|---|
| Frontend + Backend | Next.js (App Router, latest stable) |
| Database | PostgreSQL |
| Containerization | Docker / Docker Compose |
| Deployment | Company-owned VPS |
| Dev environment | Local (macOS) |

## Roles

| Role | Device | Notes |
|---|---|---|
| `customer` | Mobile phone (web) | Anonymous; no login required |
| `waiter` / mozo | Tablet | 4 waiters; serves assigned tables |
| `cashier` / cajero | PC | Scans QR, confirms payment |
| `admin` | PC | Edits daily menu, manages tables and staff |
| `kitchen` / cocina | TV display | Read-only live order board |

## Core Flow

1. Customer opens daily menu on phone — no login.
2. Customer builds order (combo + extras) → app generates a QR code.
3. Customer arrives at restaurant; cashier scans the QR.
4. Cashier confirms payment: **cash** or **Yape** (no online gateway).
5. Order is released to the kitchen TV display.
6. Waiter delivers order to the selected table.

## Business Rules

| Rule | Value |
|---|---|
| Combo dine-in (`dineIn`) | S/ 13 |
| Combo takeaway (`takeaway`) | S/ 15 |
| Tupper add-on — full combo | +S/ 2 |
| Tupper add-on — partial combo | +S/ 1 |
| Menu | Editable per day by admin |
| Tables | ~30 personal tables; joinable into family tables |
| Waiters | 4 |
| Peak period | High-volume lunch service |

## Language Convention

- **UI copy / user-facing strings**: Spanish, locale `es-PE`
- **Code identifiers** (variables, functions, types, routes, DB columns): English
- **Specs and docs**: English headings; Spanish examples for domain strings are fine

## Domain Glossary

| Spanish (domain term) | English identifier | Notes |
|---|---|---|
| Menú del día | `dailyMenu` | Full daily offering |
| Entrada | `starter` | First course |
| Segundo | `mainCourse` | Main dish |
| Bebida | `drink` | Beverage |
| Postre | `dessert` | Dessert |
| Combo completo | `fullCombo` | All four courses |
| Combo parcial | `partialCombo` | Subset of courses |
| Para llevar | `takeaway` | Order to go |
| Para comer aquí | `dineIn` | Order to eat in restaurant |
| Tupper | `tupper` | Takeaway container add-on |
| Mesa personal | `personalTable` | Single-party table |
| Mesa familiar | `familyTable` | Joined tables for larger groups |
| Mozo | `waiter` | Serving staff |
| Cajero | `cashier` | Payment counter staff |
| Cocina | `kitchen` | Kitchen display view |
| Yape | `yape` | Peruvian mobile payment method (cash-equivalent at counter) |
| QR de pedido | `orderQR` | QR encoding a pending order ID |
| Pedido | `order` | A customer's placed order |

## Out of Scope

- Online payment gateways (Stripe, Izipay, Culqui, etc.)
- User accounts, authentication, or login of any kind
- Offline-first PWA or service workers
