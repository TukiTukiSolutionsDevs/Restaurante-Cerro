# Lista de pre-lanzamiento — Restaurante Cerro

## 7 días antes
- [ ] Walk-through con el dueño del restaurante en staging
- [ ] Confirmar nombres de los 4 mozos y de los cajeros
- [ ] Validar lista inicial de platos típicos del menú diario
- [ ] Imprimir códigos QR físicos por mesa (1 por mesa, 30 totales)
- [ ] Imprimir QR + URL de la landing del cliente para el counter

## 3 días antes
- [ ] Sesión de entrenamiento con el cajero (1 hora)
- [ ] Sesión de entrenamiento con los 4 mozos (1 hora cada uno o en grupo)
- [ ] Verificar que la TV de cocina conecta a la URL y que el chime se escucha
- [ ] Crear los usuarios definitivos en `/admin/staff` y rotar PINs (no usar 543210 de seed)
- [ ] Hacer un pedido completo de prueba: cliente → caja → cocina → mozo

## Día del lanzamiento
- [ ] Verificar `bash scripts/smoke-test.sh https://...` → todo verde
- [ ] Backup manual antes de abrir: `docker compose exec backup /usr/local/bin/backup.sh`
- [ ] Tener tickets de papel listos como respaldo
- [ ] Soft launch: solo 1 día con monitoreo continuo
- [ ] Tener al dueño + 1 técnico de soporte presentes

## Después del lanzamiento (semana 1)
- [ ] Revisar `/admin/reports/daily` cada noche
- [ ] Revisar `/admin/audit` para incidencias
- [ ] Recopilar feedback de los mozos y cajero
- [ ] Ajustar precios/combos según uso real
