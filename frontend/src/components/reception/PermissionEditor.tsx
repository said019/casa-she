import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  PERMISSION_GROUPS, PERMISSION_LABELS, ADMIN_ONLY_KEYS,
  PRESET_NORMAL, PRESET_MASTER, effectivePermissions,
  type PermissionKey, type PermissionMap,
} from '@/lib/permissions';

interface Props {
  value: Record<string, boolean> | undefined;       // permisos actuales del objetivo
  onChange: (next: PermissionMap) => void;
  // Capacidades del actor para deshabilitar casillas que no puede otorgar (candado).
  actorIsAdmin: boolean;
  actorPerms: PermissionMap;
  disabled?: boolean;
}

export function PermissionEditor({ value, onChange, actorIsAdmin, actorPerms, disabled }: Props) {
  const perms = effectivePermissions(value);

  const canToggle = (key: PermissionKey, turningOn: boolean): boolean => {
    if (actorIsAdmin) return true;
    if (!turningOn) return true;                          // revocar siempre permitido
    if (ADMIN_ONLY_KEYS.includes(key)) return false;      // solo admin
    return actorPerms[key] === true;                      // no otorga lo que no tiene
  };

  const setKey = (key: PermissionKey, next: boolean) => {
    onChange({ ...perms, [key]: next });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled}
          onClick={() => onChange({ ...PRESET_NORMAL })}>Preset Normal</Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !actorIsAdmin}
          title={actorIsAdmin ? undefined : 'Solo admin puede aplicar Master'}
          onClick={() => onChange({ ...PRESET_MASTER })}>Preset Master</Button>
      </div>

      {PERMISSION_GROUPS.map((group) => (
        <div key={group.title} className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-balance-olive">{group.title}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.keys.map((key) => {
              const on = perms[key] === true;
              const lockedOff = !on && !canToggle(key, true);
              return (
                <label key={key}
                  className="flex items-center justify-between gap-3 rounded-[0.85rem] border border-balance-sand/55 bg-balance-cream/50 px-3 py-2.5">
                  <span className="text-sm font-medium text-balance-dark">
                    {PERMISSION_LABELS[key]}
                    {lockedOff && <span className="ml-1 text-[10px] text-balance-dark/45">(no puedes otorgarlo)</span>}
                  </span>
                  <Switch
                    checked={on}
                    disabled={disabled || (!on && !canToggle(key, true)) || (on && !canToggle(key, false))}
                    onCheckedChange={(c) => setKey(key, c)}
                    aria-label={PERMISSION_LABELS[key]}
                  />
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
