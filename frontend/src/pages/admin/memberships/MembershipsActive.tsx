import MembershipsList from '@/pages/admin/memberships/MembershipsList';

export default function MembershipsActive() {
  return (
    <MembershipsList
      title="Membresías activas"
      description="Listado de membresías activas."
      initialFilter="active"
      hideTabs
    />
  );
}
