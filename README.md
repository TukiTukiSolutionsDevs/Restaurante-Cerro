# Restaurante Cerro — Sistema de Pedidos

Sistema web multi-rol para un restaurante de menús en Perú. Permite que los clientes ordenen desde su celular escaneando un QR, y que el personal (caja, cocina, mozos y admin) gestione pedidos en tiempo real.

## Inicio rápido

```bash
pnpm install
docker compose -f docker/docker-compose.dev.yml up -d
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Scripts disponibles

| Script | Descripción |
|--------|-------------|
| `pnpm dev` | Servidor de desarrollo Next.js |
| `pnpm build` | Build de producción |
| `pnpm start` | Inicia el servidor de producción |
| `pnpm lint` | ESLint con reglas de Next.js + import sort |
| `pnpm lint:fix` | Auto-fix de errores de lint |
| `pnpm format` | Prettier sobre todos los archivos |
| `pnpm format:check` | Verifica formato sin modificar |
| `pnpm typecheck` | TypeScript sin emitir (`tsc --noEmit`) |
| `pnpm test` | Vitest (una sola pasada) |
| `pnpm test:watch` | Vitest en modo watch |
| `pnpm test:coverage` | Vitest con cobertura v8 |
| `pnpm e2e` | Playwright (chromium + webkit) |
| `pnpm e2e:headed` | Playwright con UI visible |
| `pnpm db:generate` | Genera migraciones Drizzle |
| `pnpm db:push` | Aplica schema directamente a la DB |
| `pnpm db:studio` | Drizzle Studio (explorador visual) |

## Estructura de carpetas

```
src/
  app/
    (customer)/       # Rutas del cliente (sin auth)
    (staff)/          # Rutas del personal (caja, mozo, cocina, admin)
    api/              # Route Handlers (REST + SSE)
  components/
    ui/               # Primitivos shadcn/ui (generados)
    menu/             # Componentes de menú
    floor/            # Mapa de mesas
    auth/             # PinPad, RoleAuthGate
    kitchen/          # Display de cocina
    system/           # OfflineBanner
  db/
    schema/           # Drizzle schema (Phase 2)
    client.ts         # Pool pg + cliente Drizzle
    migrations/       # SQL generado por drizzle-kit
  lib/
    auth/             # PIN hash, sessions, rate-limit
    realtime/         # LISTEN/NOTIFY bus, SSE helpers, useSSE hook
    qr/               # JWT sign/verify, short codes
    money/            # Aritmética en centavos
    validation/       # Zod schemas compartidos
  server/
    actions/          # Server Actions (cashier, waiter, admin)
    services/         # Lógica de negocio (pricing, orders, menu…)
docker/
  Dockerfile
  docker-compose.yml          # Producción (app + db + nginx)
  docker-compose.dev.yml      # Solo postgres para desarrollo local
  nginx.conf                  # Proxy inverso SSE-friendly
tests/
  unit/               # Vitest — funciones puras
  e2e/                # Playwright — flujos completos
openspec/             # Especificaciones del proyecto (SDD)
```

## Variables de entorno

Copia `.env.example` a `.env.local` y completa los valores:

```bash
cp .env.example .env.local
```

Ver `.env.example` para la lista completa de variables requeridas.

## Especificaciones

Los artefactos de diseño y tareas están en [`openspec/`](./openspec/).

## Tecnologías

- **Next.js 16** (App Router, RSC, Server Actions)
- **PostgreSQL 16** + **Drizzle ORM**
- **Tailwind CSS v4** + **shadcn/ui**
- **Vitest** + **Playwright** (chromium + webkit)
- **Docker Compose** (desarrollo y producción)

## Operaciones

### Iniciar / detener

```bash
# Desarrollo (solo Postgres)
docker compose -f docker/docker-compose.dev.yml up -d
pnpm dev

# Producción (app + db + nginx + backup)
docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker/docker-compose.prod.yml down
```

### Aplicar migraciones nuevas

```bash
pnpm db:generate
docker compose -f docker/docker-compose.prod.yml exec app pnpm db:push
```

### Restaurar backup

Ver instrucciones completas en [`docker/RESTORE.md`](./docker/RESTORE.md).

Resumen rápido:

```bash
docker compose -f docker/docker-compose.prod.yml stop app
gunzip -c docker/backups/cerro-YYYY-MM-DD_HH-MM.sql.gz \
  | docker compose -f docker/docker-compose.prod.yml exec -T db psql -U cerro cerro
docker compose -f docker/docker-compose.prod.yml start app
```

### Rotar secretos

1. Genera nuevos valores con `openssl rand -hex 32`.
2. Actualiza `.env.production` con los nuevos valores.
3. Reinicia los servicios:
   ```bash
   docker compose -f docker/docker-compose.prod.yml --env-file .env.production up -d
   ```
4. Avisa a los usuarios que deben iniciar sesión nuevamente (rotar `SESSION_SECRET` invalida todos los tokens activos).

### Acceso de emergencia (admin perdido)

Si se pierden todos los PINs de administrador, crea un usuario admin desde cero:

```bash
SEED_ADMIN_PIN=XXXXXX docker compose -f docker/docker-compose.prod.yml exec app pnpm db:seed
```

Luego entra con ese PIN en `/caja` o `/admin` y crea los usuarios definitivos desde `/admin/staff`.

### Logs

```bash
# Logs en vivo de la app
docker compose -f docker/docker-compose.prod.yml logs -f app

# Logs rotados (json-file driver, 10 MB × 3 archivos)
# Ubicación en el host: /var/lib/docker/containers/<container-id>/
docker inspect --format='{{.LogPath}}' $(docker compose -f docker/docker-compose.prod.yml ps -q app)
```

### Monitorización mínima

Agrega esta línea al crontab del servidor para alertar si la app cae:

```bash
# Crontab: cada minuto verifica el health endpoint
* * * * * curl -sf https://tu-dominio.com/api/health || echo "ALERTA: restaurante-cerro caído $(date)" | mail -s "DOWN" admin@ejemplo.com
```

También puedes usar `bash scripts/smoke-test.sh https://tu-dominio.com` después de cada deploy.
