import axios from 'axios';
import api from '@/lib/api';
import type { ClientMembership } from '@/types/membership';

export async function fetchMyMembership(): Promise<ClientMembership | null> {
  try {
    const { data } = await api.get<ClientMembership>('/memberships/me');
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}
