import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const newsItems = [
  {
    id: '1',
    title: 'Semana de Open House',
    description: 'Invita a un amigo y recibe 2 créditos extra.',
    date: '10 Ene',
  },
  {
    id: '2',
    title: 'Nueva clase: Hot Pilates',
    description: 'Todos los miércoles a las 7:00am.',
    date: '7 Ene',
  },
  {
    id: '3',
    title: 'Descuento de aniversario',
    description: '20% en planes trimestrales durante enero.',
    date: '1 Ene',
  },
];

export default function News() {
  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Noticias</h1>
              <p className="text-muted-foreground">Últimas novedades del estudio.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/app">Volver</Link>
            </Button>
          </div>

          <div className="space-y-4">
            {newsItems.map((item) => (
              <Card key={item.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.date}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
