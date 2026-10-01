import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';
import { GameItem } from '../types';
import { slugifyGame } from '../utils/cacheManager';

const GAMES_COLLECTION = 'games';

/**
 * Refresh and query all games currently stored in Firestore
 */
export async function syncAllGamesToFirebase(): Promise<{ total: number; added: number }> {
  try {
    const gamesCol = collection(db, GAMES_COLLECTION);
    const snapshot = await getDocs(gamesCol);
    return { total: snapshot.size, added: 0 };
  } catch (err) {
    console.warn('Error querying Firebase games count:', err);
    return { total: 0, added: 0 };
  }
}

/**
 * Add a new game directly to Firestore
 */
export async function addGameToFirebase(game: GameItem): Promise<string> {
  if (!game.name || !game.repo) {
    throw new Error('Game name and GitHub repository URL are required.');
  }

  const gameId = slugifyGame(game.name);
  const gameDocRef = doc(db, GAMES_COLLECTION, gameId);

  const payload: any = {
    name: game.name.trim(),
    repo: game.repo.trim(),
    thumbnail: game.thumbnail?.trim() || '',
    badge: game.badge || 'Low',
    genre: game.genre || 'Action',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (game.entryPoint?.trim()) {
    payload.entryPoint = game.entryPoint.trim();
  }
  if (game.defaultAspectRatio) {
    payload.defaultAspectRatio = game.defaultAspectRatio;
  }
  if (game.subPath?.trim()) {
    payload.subPath = game.subPath.trim();
  }

  await setDoc(gameDocRef, payload, { merge: true });
  return gameId;
}

/**
 * Delete a game from Firestore
 */
export async function deleteGameFromFirebase(gameIdOrName: string): Promise<void> {
  const slugId = slugifyGame(gameIdOrName);
  try {
    await deleteDoc(doc(db, GAMES_COLLECTION, slugId));
  } catch (e) {
    console.warn('Error deleting by slug:', e);
  }
  if (slugId !== gameIdOrName) {
    try {
      await deleteDoc(doc(db, GAMES_COLLECTION, gameIdOrName));
    } catch {}
  }
}

/**
 * Update an existing game in Firestore
 */
export async function updateGameInFirebase(oldName: string, updatedGame: GameItem): Promise<string> {
  if (!updatedGame.name || !updatedGame.repo) {
    throw new Error('Game name and GitHub repository URL are required.');
  }

  const oldDocId = slugifyGame(oldName);
  const newDocId = slugifyGame(updatedGame.name);

  // If the game name changed, delete the old document so we don't have duplicates
  if (oldDocId !== newDocId) {
    try {
      await deleteDoc(doc(db, GAMES_COLLECTION, oldDocId));
    } catch (e) {
      console.warn('Could not delete old game doc when renaming:', e);
    }
  }

  const gameDocRef = doc(db, GAMES_COLLECTION, newDocId);
  const payload: any = {
    name: updatedGame.name.trim(),
    repo: updatedGame.repo.trim(),
    thumbnail: updatedGame.thumbnail?.trim() || '',
    badge: updatedGame.badge || 'Low',
    genre: updatedGame.genre || 'Action',
    updatedAt: Date.now(),
  };

  if (updatedGame.entryPoint && updatedGame.entryPoint.trim()) {
    payload.entryPoint = updatedGame.entryPoint.trim();
  } else {
    payload.entryPoint = '';
  }

  if (updatedGame.defaultAspectRatio) {
    payload.defaultAspectRatio = updatedGame.defaultAspectRatio;
  }

  if (updatedGame.subPath && updatedGame.subPath.trim()) {
    payload.subPath = updatedGame.subPath.trim();
  } else {
    payload.subPath = '';
  }

  await setDoc(gameDocRef, payload, { merge: true });
  return newDocId;
}

/**
 * Subscribe to real-time changes of the games collection in Firestore.
 */
export function subscribeToFirebaseGames(
  onGamesChange: (games: GameItem[]) => void,
  onError?: (error: Error) => void
): () => void {
  const gamesCol = collection(db, GAMES_COLLECTION);

  const unsubscribe = onSnapshot(
    gamesCol,
    (snapshot) => {
      const gamesList: GameItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        gamesList.push({
          name: data.name || docSnap.id,
          repo: data.repo || '',
          thumbnail: data.thumbnail || '',
          badge: data.badge || 'Low',
          genre: data.genre || 'Action',
          gameNumber: data.gameNumber,
          defaultAspectRatio: data.defaultAspectRatio,
          entryPoint: data.entryPoint,
          subPath: data.subPath,
        });
      });

      // Sort alphabetically
      gamesList.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );

      onGamesChange(gamesList);
    },
    (err) => {
      console.warn('Firestore games listener encountered an error:', err);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}
