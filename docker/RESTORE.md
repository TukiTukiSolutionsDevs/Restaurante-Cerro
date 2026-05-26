# Restaurar backup de la base de datos

## Pasos de restauración

### 1. Detener la aplicación

Evita escrituras durante la restauración:

```bash
docker compose -f docker/docker-compose.prod.yml stop app
```

### 2. Restaurar el backup

Reemplaza `cerro-YYYY-MM-DD_HH-MM.sql.gz` con el archivo que deseas restaurar:

```bash
gunzip -c docker/backups/cerro-YYYY-MM-DD_HH-MM.sql.gz \
  | docker compose -f docker/docker-compose.prod.yml exec -T db \
    psql -U cerro cerro
```

### 3. Reiniciar la aplicación

```bash
docker compose -f docker/docker-compose.prod.yml start app
```

---

## Listar backups disponibles

```bash
ls -lht docker/backups/
```

## Backup manual inmediato

Para forzar un backup sin esperar el ciclo de 24 h:

```bash
docker compose -f docker/docker-compose.prod.yml exec backup \
  sh -c 'pg_dump -U "$POSTGRES_USER" -h db cerro \
    | gzip > /backups/manual-$(date +%Y-%m-%d_%H-%M).sql.gz \
    && echo OK'
```

## Notas

- Los backups automáticos se generan cada **24 horas**.
- Se eliminan automáticamente los archivos con más de **14 días** de antigüedad.
- Detener siempre la app antes de restaurar para evitar inconsistencias.
- Verificar la integridad del archivo antes de restaurar:
  ```bash
  gunzip -t docker/backups/cerro-YYYY-MM-DD_HH-MM.sql.gz && echo "OK"
  ```
