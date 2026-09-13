import { auth } from '../../firebaseConfig';
export async function resetSeason(){const user=auth.currentUser;if(!user)throw new Error('ログインしてください。');const response=await fetch('/api/admin/start-season',{method:'POST',headers:{Authorization:`Bearer ${await user.getIdToken()}`}});const result=await response.json();if(!response.ok)throw new Error(result.error);return result;}
