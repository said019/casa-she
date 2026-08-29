import assert from 'node:assert/strict';
import {
  effectivePermissions,
  hasPermission,
  mergeRequested,
  validatePermissionChange,
  isMasterPreset,
  PRESET_NORMAL,
  PRESET_MASTER,
} from '../src/lib/permissions.js';

// effectivePermissions: parte de Normal, lo explícito gana
{
  const p = effectivePermissions({ caja: false, editar_catalogo: true, basura: true });
  assert.equal(p.caja, false, 'explícito false gana sobre Normal');
  assert.equal(p.vender, true, 'sección no tocada queda en Normal=true');
  assert.equal(p.editar_catalogo, true, 'sensible explícito true');
  assert.equal((p as any).basura, undefined, 'clave desconocida se ignora');
}

// hasPermission: admin y recepción tienen paridad operativa; otros false
assert.equal(hasPermission({ role: 'admin' }, 'nomina'), true);
assert.equal(hasPermission({ role: 'super_admin' }, 'editar_catalogo'), true);
assert.equal(hasPermission({ role: 'reception', permissions: PRESET_NORMAL }, 'caja'), true);
assert.equal(hasPermission({ role: 'reception', permissions: PRESET_NORMAL }, 'editar_catalogo'), true);
assert.equal(hasPermission({ role: 'reception', permissions: PRESET_MASTER }, 'nomina'), true);
assert.equal(hasPermission({ role: 'client', permissions: PRESET_MASTER }, 'caja'), false);
assert.equal(hasPermission(null, 'caja'), false);

// Toda recepción pasa CUALQUIER permiso, aunque el mapa legacy esté incompleto.
assert.equal(hasPermission({ role: 'reception', permissions: { checkin: false }, is_reception_master: true }, 'checkin'), true, 'master pasa aunque checkin=false en el objeto');
assert.equal(hasPermission({ role: 'reception', permissions: {}, isReceptionMaster: true }, 'nomina'), true, 'master (camelCase del JWT) pasa nomina');
assert.equal(hasPermission({ role: 'reception', permissions: { checkin: false } }, 'checkin'), true, 'recepción tiene paridad operativa');

// isMasterPreset
assert.equal(isMasterPreset(PRESET_MASTER), true);
assert.equal(isMasterPreset(PRESET_NORMAL), false);

// validatePermissionChange — admin sin topes
{
  const r = validatePermissionChange({
    actorRole: 'admin', actorIsSelf: false,
    actorPerms: PRESET_NORMAL, current: PRESET_NORMAL,
    requested: { ...PRESET_NORMAL, nomina: true, gestionar_permisos: true },
  });
  assert.equal(r.ok, true, 'admin puede todo');
}

// Recepción tiene paridad: puede editar permisos, incluso los propios.
{
  const r = validatePermissionChange({
    actorRole: 'reception', actorIsSelf: true,
    actorPerms: PRESET_MASTER, current: PRESET_NORMAL, requested: PRESET_NORMAL,
  });
  assert.equal(r.ok, true, 'recepción comparte autoridad administrativa');
}

// El mapa legacy no limita a recepción.
{
  const actor = { ...PRESET_NORMAL, gestionar_permisos: true }; // master parcial: gestiona pero NO edita catálogo
  const r = validatePermissionChange({
    actorRole: 'reception', actorIsSelf: false,
    actorPerms: actor, current: PRESET_NORMAL,
    requested: { ...PRESET_NORMAL, editar_catalogo: true },
  });
  assert.equal(r.ok, true, 'recepción puede otorgar permisos operativos');
}

// Recepción puede gestionar también las capacidades históricamente admin-only.
{
  const r = validatePermissionChange({
    actorRole: 'reception', actorIsSelf: false,
    actorPerms: PRESET_MASTER, current: PRESET_NORMAL,
    requested: { ...PRESET_NORMAL, gestionar_permisos: true },
  });
  assert.equal(r.ok, true, 'paridad administrativa completa');
}

// master SÍ puede revocar algo que él no tiene
{
  const actor = { ...PRESET_NORMAL, gestionar_permisos: true };
  const r = validatePermissionChange({
    actorRole: 'reception', actorIsSelf: false,
    actorPerms: actor,
    current: { ...PRESET_NORMAL, editar_catalogo: true },
    requested: { ...PRESET_NORMAL, editar_catalogo: false },
  });
  assert.equal(r.ok, true, 'revocar siempre permitido');
}

// master con todos los permisos otorga uno operativo
{
  const r = validatePermissionChange({
    actorRole: 'reception', actorIsSelf: false,
    actorPerms: PRESET_MASTER,
    current: { ...PRESET_NORMAL, editar_catalogo: false },
    requested: { ...PRESET_NORMAL, editar_catalogo: true },
  });
  assert.equal(r.ok, true, 'master otorga lo que sí tiene');
}

// mergeRequested: parte del actual y aplica lo pedido
{
  const merged = mergeRequested({ ...PRESET_NORMAL, editar_catalogo: true }, { caja: false });
  assert.equal(merged.caja, false);
  assert.equal(merged.editar_catalogo, true, 'conserva lo no pedido');
}

console.log('test-permissions: OK');
