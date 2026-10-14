import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  initializeFirestore,
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc
} from 'firebase/firestore';
import { 
  BusinessCard, 
  ContactGroup, 
  Project, 
  MyProfile, 
  Vehicle, 
  DrivingLog, 
  VehicleExpense, 
  VehicleMaintenance, 
  MaintenanceInterval, 
  DailyWorkLog, 
  WeeklyWorkLog,
  RegisteredUser
} from '../types.js';
import config from '../../firebase-applet-config.json';

const app = initializeApp(config);
export const firestore = config.firestoreDatabaseId 
  ? getFirestore(app, config.firestoreDatabaseId)
  : getFirestore(app);

// Check if users collection is seeded
export async function ensureUsersSeeded(initialUsers: RegisteredUser[]) {
  try {
    const colRef = collection(firestore, 'users');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      console.log('Seeding initial users to Firestore...');
      for (const u of initialUsers) {
        await setDoc(doc(firestore, 'users', u.id), u);
      }
    }
  } catch (error) {
    console.error('Error seeding users:', error);
  }
}

// Check if scope is initialized in Firestore. If not, seed it.
export async function ensureScopeInitialized(scopeId: string, initialData: {
  contacts: BusinessCard[];
  projects: Project[];
  groups: ContactGroup[];
  myProfile: MyProfile;
  vehicles: Vehicle[];
  drivingLogs: DrivingLog[];
  expenses: VehicleExpense[];
  maintenances: VehicleMaintenance[];
  maintenanceIntervals: MaintenanceInterval[];
  dailyLogs: DailyWorkLog[];
  weeklyLogs: WeeklyWorkLog[];
}) {
  try {
    const metaDocRef = doc(firestore, 'scopes', scopeId);
    const metaSnap = await getDoc(metaDocRef);
    
    if (!metaSnap.exists()) {
      console.log(`Seeding initial data for scope: ${scopeId}`);
      // Create meta doc
      await setDoc(metaDocRef, { initialized: true, createdAt: new Date().toISOString() });

      // Seed contacts
      for (const item of initialData.contacts) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'contacts', item.id), item);
      }
      // Seed projects
      for (const item of initialData.projects) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'projects', item.id), item);
      }
      // Seed groups
      for (const item of initialData.groups) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'groups', item.id), item);
      }
      // Seed myProfile
      await setDoc(doc(firestore, 'scopes', scopeId, 'myProfile', 'profile'), initialData.myProfile);

      // Seed vehicles
      for (const item of initialData.vehicles) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'vehicles', item.id), item);
      }
      // Seed drivingLogs
      for (const item of initialData.drivingLogs) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'drivingLogs', item.id), item);
      }
      // Seed expenses
      for (const item of initialData.expenses) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'expenses', item.id), item);
      }
      // Seed maintenances
      for (const item of initialData.maintenances) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'maintenances', item.id), item);
      }
      // Seed maintenanceIntervals
      for (const item of initialData.maintenanceIntervals) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'maintenanceIntervals', item.id), item);
      }
      // Seed dailyLogs
      for (const item of initialData.dailyLogs) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'dailyLogs', item.id), item);
      }
      // Seed weeklyLogs
      for (const item of initialData.weeklyLogs) {
        await setDoc(doc(firestore, 'scopes', scopeId, 'weeklyLogs', item.id), item);
      }
    }
  } catch (error) {
    console.error(`Error ensuring scope ${scopeId} is initialized:`, error);
  }
}

// Fetch all data for a scope (this is used when we want to load everything, e.g. for API routes or cache)
export async function getScopedCollection<T>(scopeId: string, collectionName: string): Promise<T[]> {
  const colRef = collection(firestore, 'scopes', scopeId, collectionName);
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map(d => d.data() as T);
}

export async function getScopedDoc<T>(scopeId: string, collectionName: string, docId: string): Promise<T | null> {
  const docRef = doc(firestore, 'scopes', scopeId, collectionName, docId);
  const snap = await getDoc(docRef);
  return snap.exists() ? snap.data() as T : null;
}

export async function setScopedDoc<T extends { id: string }>(scopeId: string, collectionName: string, item: T): Promise<void> {
  const docRef = doc(firestore, 'scopes', scopeId, collectionName, item.id);
  await setDoc(docRef, item);
}

export async function setScopedProfile(scopeId: string, profile: MyProfile): Promise<void> {
  const docRef = doc(firestore, 'scopes', scopeId, 'myProfile', 'profile');
  await setDoc(docRef, profile);
}

export async function updateScopedDoc<T>(scopeId: string, collectionName: string, docId: string, updates: Partial<T>): Promise<void> {
  const docRef = doc(firestore, 'scopes', scopeId, collectionName, docId);
  await updateDoc(docRef, updates as any);
}

export async function deleteScopedDoc(scopeId: string, collectionName: string, docId: string): Promise<void> {
  const docRef = doc(firestore, 'scopes', scopeId, collectionName, docId);
  await deleteDoc(docRef);
}

// Users collection functions
export async function getUsers(): Promise<RegisteredUser[]> {
  const colRef = collection(firestore, 'users');
  const snapshot = await getDocs(colRef);
  return snapshot.docs.map(d => d.data() as RegisteredUser);
}

export async function addUser(user: RegisteredUser): Promise<void> {
  const docRef = doc(firestore, 'users', user.id);
  await setDoc(docRef, user);
}
