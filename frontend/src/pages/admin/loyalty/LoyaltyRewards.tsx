import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, Edit, Trash2, Gift } from 'lucide-react';
import { AdminLayout } from '@/components/layout/AdminLayout';
import api from '@/lib/api';

interface Reward {
    id: number;
    name: string;
    description: string;
    points_cost: number;
    reward_type: string;
    reward_value: string;
    is_active: boolean;
    stock: number | null;
}

export default function LoyaltyRewards() {
    const [loading, setLoading] = useState(true);
    const [rewards, setRewards] = useState<Reward[]>([]);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingReward, setEditingReward] = useState<Reward | null>(null);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        description: '',
        points_cost: 100,
        reward_type: 'discount',
        reward_value: '10',
        is_active: true,
        stock: '',
    });
    const { toast } = useToast();

    useEffect(() => {
        loadRewards();
    }, []);

    const loadRewards = async () => {
        try {
            const response = await api.get('/loyalty/rewards');
            setRewards(response.data || []);
        } catch (error) {
            console.error('Error loading rewards:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...form,
                stock: form.stock ? parseInt(form.stock) : null,
            };

            if (editingReward) {
                await api.put(`/loyalty/rewards/${editingReward.id}`, payload);
            } else {
                await api.post('/loyalty/rewards', payload);
            }

            toast({
                title: editingReward ? 'Recompensa actualizada' : 'Recompensa creada',
                description: 'La recompensa se ha guardado correctamente.',
            });

            setDialogOpen(false);
            resetForm();
            loadRewards();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo guardar la recompensa.',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (reward: Reward) => {
        setEditingReward(reward);
        setForm({
            name: reward.name,
            description: reward.description || '',
            points_cost: reward.points_cost,
            reward_type: reward.reward_type,
            reward_value: reward.reward_value || '',
            is_active: reward.is_active,
            stock: reward.stock?.toString() || '',
        });
        setDialogOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm('¿Estás seguro de eliminar esta recompensa?')) return;

        try {
            await api.delete(`/loyalty/rewards/${id}`);
            toast({
                title: 'Recompensa eliminada',
                description: 'La recompensa se ha eliminado correctamente.',
            });
            loadRewards();
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo eliminar la recompensa.',
                variant: 'destructive',
            });
        }
    };

    const resetForm = () => {
        setEditingReward(null);
        setForm({
            name: '',
            description: '',
            points_cost: 100,
            reward_type: 'discount',
            reward_value: '10',
            is_active: true,
            stock: '',
        });
    };

    const getRewardTypeLabel = (type: string) => {
        const types: Record<string, string> = {
            discount: 'Descuento %',
            free_class: 'Clase gratis',
            product: 'Producto',
            membership_extension: 'Extensión membresía',
        };
        return types[type] || type;
    };

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-heading font-bold">Recompensas</h1>
                        <p className="text-muted-foreground">
                            Gestiona las recompensas canjeables con puntos.
                        </p>
                    </div>
                    <Dialog open={dialogOpen} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Nueva Recompensa
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>
                                    {editingReward ? 'Editar Recompensa' : 'Nueva Recompensa'}
                                </DialogTitle>
                                <DialogDescription>
                                    Configura los detalles de la recompensa.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Nombre</Label>
                                    <Input
                                        id="name"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="Ej: Clase gratis"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="description">Descripción</Label>
                                    <Input
                                        id="description"
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        placeholder="Descripción de la recompensa"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="points_cost">Puntos requeridos</Label>
                                        <Input
                                            id="points_cost"
                                            type="number"
                                            min={1}
                                            value={form.points_cost}
                                            onChange={(e) => setForm({
                                                ...form,
                                                points_cost: parseInt(e.target.value) || 0
                                            })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="stock">Stock (vacío = ilimitado)</Label>
                                        <Input
                                            id="stock"
                                            type="number"
                                            min={0}
                                            value={form.stock}
                                            onChange={(e) => setForm({ ...form, stock: e.target.value })}
                                            placeholder="Ilimitado"
                                        />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between">
                                    <Label>Activa</Label>
                                    <Switch
                                        checked={form.is_active}
                                        onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSave} disabled={saving || !form.name}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Guardar
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Gift className="h-5 w-5" />
                            Catálogo de Recompensas
                        </CardTitle>
                        <CardDescription>
                            {rewards.length} recompensas disponibles
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {rewards.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                No hay recompensas configuradas.
                                <br />
                                Crea tu primera recompensa para empezar.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Puntos</TableHead>
                                        <TableHead>Stock</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {rewards.map((reward) => (
                                        <TableRow key={reward.id}>
                                            <TableCell>
                                                <div>
                                                    <div className="font-medium">{reward.name}</div>
                                                    {reward.description && (
                                                        <div className="text-sm text-muted-foreground">
                                                            {reward.description}
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getRewardTypeLabel(reward.reward_type)}
                                            </TableCell>
                                            <TableCell>{reward.points_cost}</TableCell>
                                            <TableCell>
                                                {reward.stock !== null ? reward.stock : 'Ilimitado'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={reward.is_active ? 'default' : 'secondary'}>
                                                    {reward.is_active ? 'Activa' : 'Inactiva'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEdit(reward)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(reward.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </AdminLayout>
    );
}
