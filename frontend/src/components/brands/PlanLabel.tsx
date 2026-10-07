import { canalDePlan } from '@/lib/canales';
import { ChannelLogo } from './ChannelLogo';

/** Nombre de un plan; si es el plan interno de una plataforma ("Totalpass"), su logo. */
export function PlanLabel({ nombre, alto = 9 }: { nombre: string; alto?: number }) {
    const canal = canalDePlan(nombre);
    return canal ? <ChannelLogo canal={canal} alto={alto} /> : <>{nombre}</>;
}
