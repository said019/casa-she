import { AuthGuard } from '@/components/layout/AuthGuard';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Card, CardContent } from '@/components/ui/card';

interface PlaceholderProps {
  title: string;
  description?: string;
}

export default function AdminPlaceholder({ title, description }: PlaceholderProps) {
  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <AdminLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-heading font-bold">{title}</h1>
            {description && <p className="text-muted-foreground">{description}</p>}
          </div>
          <Card>
            <CardContent className="py-10 text-muted-foreground">
              Esta sección está en construcción.
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
