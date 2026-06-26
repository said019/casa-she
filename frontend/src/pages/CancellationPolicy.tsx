import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export default function CancellationPolicy() {
    const { data: policy } = useQuery<{ min_hours?: number }>({
        queryKey: ['cancellation-policy'],
        queryFn: async () => (await api.get('/settings/cancellation-policy')).data,
    });
    const minHours = Number(policy?.min_hours ?? 12);
    return (
        <div className="min-h-screen bg-muted/20">
            <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b pt-[env(safe-area-inset-top)]">
                <div className="container mx-auto px-4 lg:px-8 py-4">
                    <Link
                        to="/"
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Volver al inicio
                    </Link>
                </div>
            </header>

            <div className="container mx-auto px-4 lg:px-8 py-12">
                <div className="max-w-3xl mx-auto">
                    <div className="bg-background rounded-lg border p-8 lg:p-12 space-y-10">
                        <div className="space-y-4 pb-8 border-b">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="w-8 h-8 text-primary" />
                                <h1 className="font-heading text-3xl lg:text-4xl font-bold">Política de cancelación</h1>
                            </div>
                            <p className="text-muted-foreground">
                                Última actualización: 27 de abril de 2026
                            </p>
                            <p className="text-muted-foreground leading-relaxed">
                                En Casa Shé cuidamos el tiempo de cada alumna y coach. Las clases tienen
                                solo 6 lugares, por eso cada reserva ocupa un crédito.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <h2 className="font-heading text-2xl font-semibold">Reglas</h2>

                            <div className="flex items-start gap-4 p-5 rounded-xl border bg-emerald-50/50 border-emerald-200 dark:bg-emerald-950/10 dark:border-emerald-800">
                                <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5 shrink-0" />
                                <div>
                                    <h3 className="font-semibold text-base mb-1">Cancelación con {minHours} {minHours === 1 ? 'hora' : 'horas'} o más</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Si cancelas al menos {minHours} {minHours === 1 ? 'hora' : 'horas'} antes de la clase, el crédito vuelve a tu paquete.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-5 rounded-xl border bg-red-50/50 border-red-200 dark:bg-red-950/10 dark:border-red-800">
                                <XCircle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
                                <div>
                                    <h3 className="font-semibold text-base mb-1">Cancelación con menos de {minHours} {minHours === 1 ? 'hora' : 'horas'}</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        La reserva puede cancelarse, pero el crédito no se devuelve.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-start gap-4 p-5 rounded-xl border bg-red-50/50 border-red-200 dark:bg-red-950/10 dark:border-red-800">
                                <Clock className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
                                <div>
                                    <h3 className="font-semibold text-base mb-1">Inasistencia</h3>
                                    <p className="text-sm text-muted-foreground leading-relaxed">
                                        Si no asistes, se descuenta el crédito reservado.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h2 className="font-heading text-2xl font-semibold">Resumen</h2>
                            <div className="overflow-hidden rounded-xl border">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-muted/50">
                                            <th className="text-left px-4 py-3 font-semibold">Situación</th>
                                            <th className="text-left px-4 py-3 font-semibold">Crédito</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        <tr>
                                            <td className="px-4 py-3 text-muted-foreground">{minHours} {minHours === 1 ? 'hora' : 'horas'} o más antes de clase</td>
                                            <td className="px-4 py-3 text-emerald-600 font-medium">Se devuelve</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 text-muted-foreground">Menos de {minHours} {minHours === 1 ? 'hora' : 'horas'} antes de clase</td>
                                            <td className="px-4 py-3 text-red-500 font-medium">Se descuenta</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 text-muted-foreground">No asistir</td>
                                            <td className="px-4 py-3 text-red-500 font-medium">Se descuenta</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="space-y-4 pt-8 border-t">
                            <h2 className="font-heading text-2xl font-semibold">¿Necesitas ayuda?</h2>
                            <div className="bg-muted/50 p-6 rounded-lg space-y-3">
                                <div>
                                    <p className="text-sm font-medium">Casa Shé</p>
                                    <p className="text-sm text-muted-foreground">
                                        Alfonso Reyes 131 · Condesa, CDMX
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium">Email</p>
                                    <a href="mailto:casashecondesa@gmail.com" className="text-sm text-primary hover:underline">
                                        casashecondesa@gmail.com
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 border-t">
                            <p className="text-xs text-muted-foreground">
                                Al reservar una clase, confirmas que has leído y aceptado esta política y nuestros{" "}
                                <Link to="/terms" className="text-primary hover:underline">
                                    términos y condiciones
                                </Link>
                                .
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
