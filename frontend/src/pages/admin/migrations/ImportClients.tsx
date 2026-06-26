import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  ArrowLeft,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Eye,
  X,
} from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  class_limit: number | null;
}

interface ParsedClient {
  displayName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  planId: string;
  planName?: string;
  originalPaymentDate: string;
  paymentAmount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  receiptNumber?: string;
  membershipStartDate: string;
  membershipEndDate: string;
  classesUsed: number;
  migrationNotes?: string;
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  success: boolean;
  results: {
    total: number;
    success: number;
    skipped: number;
    errors: Array<{ email: string; name: string; error: string }>;
    migrated: Array<{ id: string; email: string; name: string; tempPassword: string }>;
  };
  message: string;
}

export default function ImportClients() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/plans?all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setPlans(data);
      }
    } catch (error) {
      console.error('Error fetching plans:', error);
    }
  };

  const downloadTemplate = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/migrations/template`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error('Error al descargar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'plantilla_migracion.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: 'Descargado',
        description: 'Plantilla descargada exitosamente',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo descargar la plantilla',
        variant: 'destructive',
      });
    }
  };

  const parseCSV = (text: string): ParsedClient[] => {
    const lines = text.split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const clients: ParsedClient[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const errors: string[] = [];

      const getValue = (key: string) => {
        const index = headers.indexOf(key);
        return index >= 0 ? values[index] : '';
      };

      const displayName = getValue('nombre_completo');
      const email = getValue('email');
      const phone = getValue('telefono');
      const planId = getValue('plan_id');
      const paymentDate = getValue('fecha_pago');
      const amount = getValue('monto_pagado');
      const startDate = getValue('fecha_inicio');
      const endDate = getValue('fecha_vencimiento');

      if (!displayName) errors.push('Nombre requerido');
      if (!email) errors.push('Email requerido');
      if (!phone) errors.push('Teléfono requerido');
      if (!planId) errors.push('Plan ID requerido');
      if (!paymentDate) errors.push('Fecha de pago requerida');
      if (!amount) errors.push('Monto requerido');
      if (!startDate) errors.push('Fecha inicio requerida');
      if (!endDate) errors.push('Fecha vencimiento requerida');

      const plan = plans.find((p) => p.id === planId);
      if (planId && !plan) errors.push('Plan no encontrado');

      const paymentMethodRaw = getValue('metodo_pago').toLowerCase();
      const normalizedMethod: 'cash' | 'transfer' | 'card' = 
        paymentMethodRaw === 'efectivo' || paymentMethodRaw === 'cash' ? 'cash' : 
        paymentMethodRaw === 'transferencia' || paymentMethodRaw === 'transfer' ? 'transfer' : 
        paymentMethodRaw === 'tarjeta' || paymentMethodRaw === 'card' ? 'card' : 'cash';

      clients.push({
        displayName,
        email,
        phone,
        dateOfBirth: getValue('fecha_nacimiento') || undefined,
        planId,
        planName: plan?.name,
        originalPaymentDate: paymentDate,
        paymentAmount: parseFloat(amount) || 0,
        paymentMethod: normalizedMethod || 'cash',
        receiptNumber: getValue('numero_recibo') || undefined,
        membershipStartDate: startDate,
        membershipEndDate: endDate,
        classesUsed: parseInt(getValue('clases_usadas') || '0', 10),
        migrationNotes: getValue('notas') || undefined,
        valid: errors.length === 0,
        errors,
      });
    }

    return clients;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.csv')) {
      toast({
        title: 'Error',
        description: 'Solo se permiten archivos CSV',
        variant: 'destructive',
      });
      return;
    }

    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsed = parseCSV(text);
      setParsedClients(parsed);
      setStep('preview');
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    const validClients = parsedClients.filter((c) => c.valid);
    if (validClients.length === 0) {
      toast({
        title: 'Error',
        description: 'No hay usuarios válidos para importar',
        variant: 'destructive',
      });
      return;
    }

    setImporting(true);
    setStep('importing');
    setProgress(0);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_URL}/migrations/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clients: validClients.map((c) => ({
            ...c,
            sendWelcomeEmail: true,
            generateWalletPass: true,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error en la importación');
      }

      setResult(data);
      setStep('done');
      toast({
        title: '¡Importación completada!',
        description: data.message,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      setStep('preview');
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsedClients([]);
    setResult(null);
    setStep('upload');
  };

  const validCount = parsedClients.filter((c) => c.valid).length;
  const invalidCount = parsedClients.filter((c) => !c.valid).length;

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate('/admin/migrations')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-heading font-bold">Importar Usuarios</h1>
            <p className="text-muted-foreground">Migración masiva desde archivo CSV</p>
          </div>
        </div>

        {step === 'upload' && (
          <div className="space-y-6">
            {/* Instrucciones */}
            <Card>
              <CardHeader>
                <CardTitle>Instrucciones</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <div className="w-8 h-8 bg-info/10 rounded-full flex items-center justify-center text-info font-bold">
                      1
                    </div>
                    <div>
                      <p className="font-medium">Descarga la plantilla</p>
                      <p className="text-sm text-muted-foreground">
                        Usa nuestra plantilla CSV con las columnas correctas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <div className="w-8 h-8 bg-info/10 rounded-full flex items-center justify-center text-info font-bold">
                      2
                    </div>
                    <div>
                      <p className="font-medium">Llena la información</p>
                      <p className="text-sm text-muted-foreground">
                        Un usuario por fila, respeta el formato de fechas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
                    <div className="w-8 h-8 bg-info/10 rounded-full flex items-center justify-center text-info font-bold">
                      3
                    </div>
                    <div>
                      <p className="font-medium">Sube el archivo</p>
                      <p className="text-sm text-muted-foreground">
                        Revisa la vista previa y confirma la importación
                      </p>
                    </div>
                  </div>
                </div>

                <Button variant="outline" onClick={downloadTemplate}>
                  <Download className="w-4 h-4 mr-2" />
                  Descargar plantilla CSV
                </Button>
              </CardContent>
            </Card>

            {/* Planes disponibles */}
            <Card>
              <CardHeader>
                <CardTitle>Planes Disponibles</CardTitle>
                <CardDescription>
                  Usa estos IDs en la columna "plan_id" del CSV
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan</TableHead>
                      <TableHead>ID (copiar al CSV)</TableHead>
                      <TableHead>Duración</TableHead>
                      <TableHead>Clases</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plans.map((plan) => (
                      <TableRow key={plan.id}>
                        <TableCell className="font-medium">{plan.name}</TableCell>
                        <TableCell>
                          <code className="bg-muted px-2 py-1 rounded text-xs">
                            {plan.id}
                          </code>
                        </TableCell>
                        <TableCell>{plan.duration_days} días</TableCell>
                        <TableCell>
                          {plan.class_limit ? `${plan.class_limit} clases` : 'Ilimitado'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Subir Archivo</CardTitle>
              </CardHeader>
              <CardContent>
                <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-muted transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="w-10 h-10 text-muted-foreground mb-3" />
                    <p className="mb-2 text-sm text-muted-foreground">
                      <span className="font-semibold">Haz clic para subir</span> o arrastra
                      el archivo
                    </p>
                    <p className="text-xs text-muted-foreground">Solo archivos CSV</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                </label>
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-6">
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{parsedClients.length}</p>
                  <p className="text-sm text-muted-foreground">Total en archivo</p>
                </CardContent>
              </Card>
              <Card className="border-success/30 bg-success/10">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-success">{validCount}</p>
                  <p className="text-sm text-success">Válidos para importar</p>
                </CardContent>
              </Card>
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-red-600">{invalidCount}</p>
                  <p className="text-sm text-red-600">Con errores</p>
                </CardContent>
              </Card>
            </div>

            {/* Vista previa */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Vista Previa</CardTitle>
                  <Button variant="ghost" size="sm" onClick={resetImport}>
                    <X className="w-4 h-4 mr-2" />
                    Cancelar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Estado</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Monto</TableHead>
                        <TableHead>Vigencia</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedClients.map((client, index) => (
                        <TableRow key={index} className={!client.valid ? 'bg-red-50' : ''}>
                          <TableCell>
                            {client.valid ? (
                              <CheckCircle className="w-5 h-5 text-success" />
                            ) : (
                              <div className="flex items-center gap-2">
                                <XCircle className="w-5 h-5 text-red-500" />
                                <span className="text-xs text-red-600">
                                  {client.errors.join(', ')}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{client.displayName}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>{client.planName || client.planId}</TableCell>
                          <TableCell>${client.paymentAmount}</TableCell>
                          <TableCell className="text-sm">
                            {client.membershipStartDate} - {client.membershipEndDate}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Acciones */}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={resetImport}>
                Cancelar
              </Button>
              <Button
                className="flex-1"
                onClick={handleImport}
                disabled={validCount === 0}
              >
                <Upload className="w-4 h-4 mr-2" />
                Importar {validCount} usuarios
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <Card>
            <CardContent className="py-12 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-info mx-auto mb-4" />
              <p className="text-lg font-medium">Importando usuarios...</p>
              <p className="text-muted-foreground mb-4">Por favor espera, esto puede tomar unos minutos</p>
              <Progress value={progress} className="max-w-md mx-auto" />
            </CardContent>
          </Card>
        )}

        {step === 'done' && result && (
          <div className="space-y-6">
            <Card className="border-success/30 bg-success/10">
              <CardHeader className="text-center">
                <div className="mx-auto w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <CardTitle className="text-success">¡Importación Completada!</CardTitle>
                <CardDescription>{result.message}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-success">
                      {result.results.success}
                    </p>
                    <p className="text-sm text-muted-foreground">Importados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-warning">
                      {result.results.skipped}
                    </p>
                    <p className="text-sm text-muted-foreground">Saltados</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">
                      {result.results.errors.length}
                    </p>
                    <p className="text-sm text-muted-foreground">Errores</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {result.results.migrated.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Usuarios Importados</CardTitle>
                  <CardDescription>
                    Guarda las contraseñas temporales para compartir con los usuarios
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Contraseña Temporal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.results.migrated.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">{client.name}</TableCell>
                          <TableCell>{client.email}</TableCell>
                          <TableCell>
                            <code className="bg-warning/10 px-2 py-1 rounded text-sm font-mono">
                              {client.tempPassword}
                            </code>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {result.results.errors.length > 0 && (
              <Card className="border-red-200">
                <CardHeader>
                  <CardTitle className="text-red-800">Errores</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.results.errors.map((error, index) => (
                        <TableRow key={index}>
                          <TableCell>{error.name}</TableCell>
                          <TableCell>{error.email}</TableCell>
                          <TableCell className="text-red-600">{error.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={resetImport}>
                Importar más usuarios
              </Button>
              <Button className="flex-1" onClick={() => navigate('/admin/migrations')}>
                Ver todos los migrados
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
