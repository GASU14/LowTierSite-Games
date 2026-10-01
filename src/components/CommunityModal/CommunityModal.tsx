import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
  getDocs,
  where
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../../firebase';
import { optimizeImageTo300x300 } from '../../utils/imageOptimizer';
import { CommunityTab, PostCategory, CommunityPost, CommunityUser } from './types';
import { CommunityAuthModal } from './CommunityAuthModal';
import {
  X,
  Plus,
  Send,
  MessageSquare,
  Megaphone,
  Users,
  Shield,
  Trash2,
  AlertTriangle,
  Lightbulb,
  User as UserIcon,
  Loader2,
  Maximize2,
  Gamepad2,
  RefreshCw,
  Ban,
  CheckCircle2,
  Check,
  Crown,
  Key,
  Pencil,
  Sparkles
} from 'lucide-react';
import {
  addGameToFirebase,
  deleteGameFromFirebase,
  updateGameInFirebase,
  syncAllGamesToFirebase
} from '../../services/gamesFirebaseService';
import { deleteGameCache, slugifyGame } from '../../utils/cacheManager';
import { GameItem } from '../../types';

export const AVAILABLE_GENRES = [
  'Action',
  'Adventure',
  'Arcade',
  'Endless Runner',
  'Horror',
  'Platformer',
  'Puzzle',
  'Racing',
  'Roleplay',
  'Sandbox',
  'Shooter',
  'Simulation',
  'Sports',
  'Strategy',
  'Survival',
];

interface CommunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  gamesList?: GameItem[];
}

export const CommunityModal: React.FC<CommunityModalProps> = ({
  isOpen,
  onClose,
  gamesList = []
}) => {
  const [activeTab, setActiveTab] = useState<CommunityTab>('general');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [members, setMembers] = useState<CommunityUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputText, setInputText] = useState('');
  const [stagedImage, setStagedImage] = useState<string | null>(null);
  const [optimizingImage, setOptimizingImage] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  // In-modal confirmation dialog state (replaces window.confirm() which fails in sandboxed iframes)
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // User auth state & Admin status
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Admin Add Game Form State
  const [newGameName, setNewGameName] = useState('');
  const [newGameRepo, setNewGameRepo] = useState('');
  const [newGameSubPath, setNewGameSubPath] = useState('');
  const [newGameThumbnail, setNewGameThumbnail] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Action']);
  const [customGenreInput, setCustomGenreInput] = useState('');
  const [newGameBadge, setNewGameBadge] = useState('Low');
  const [newGameEntryPoint, setNewGameEntryPoint] = useState('');
  const [newGameAspectRatio, setNewGameAspectRatio] = useState<'fill' | '16:9' | '4:3' | '9:16'>('fill');
  const [addingGame, setAddingGame] = useState(false);
  const [syncingGames, setSyncingGames] = useState(false);
  const [gameSearchQuery, setGameSearchQuery] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Admin Edit Game Form State
  const [editingGame, setEditingGame] = useState<GameItem | null>(null);
  const [editGameName, setEditGameName] = useState('');
  const [editGameRepo, setEditGameRepo] = useState('');
  const [editGameSubPath, setEditGameSubPath] = useState('');
  const [editGameEntryPoint, setEditGameEntryPoint] = useState('');
  const [editGameThumbnail, setEditGameThumbnail] = useState('');
  const [editGameBadge, setEditGameBadge] = useState('Low');
  const [editGameAspectRatio, setEditGameAspectRatio] = useState<'fill' | '16:9' | '4:3' | '9:16'>('fill');
  const [editSelectedGenres, setEditSelectedGenres] = useState<string[]>(['Action']);
  const [editCustomGenreInput, setEditCustomGenreInput] = useState('');
  const [savingEditGame, setSavingEditGame] = useState(false);
  const [clearingGameCache, setClearingGameCache] = useState(false);

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        const next = prev.filter((g) => g !== genre);
        return next.length === 0 ? [genre] : next;
      } else {
        return [...prev, genre];
      }
    });
  };

  const handleAddCustomGenre = () => {
    const trimmed = customGenreInput.trim();
    if (!trimmed) return;
    if (!selectedGenres.includes(trimmed)) {
      setSelectedGenres((prev) => [...prev, trimmed]);
    }
    setCustomGenreInput('');
  };

  const handleStartEditGame = (game: GameItem) => {
    setEditingGame(game);
    setEditGameName(game.name);
    setEditGameRepo(game.repo);
    setEditGameSubPath(game.subPath || '');
    setEditGameEntryPoint(game.entryPoint || '');
    setEditGameThumbnail(game.thumbnail || '');
    setEditGameBadge(game.badge || 'Low');
    setEditGameAspectRatio(game.defaultAspectRatio || 'fill');

    const genres = game.genre ? game.genre.split(',').map((g) => g.trim()).filter(Boolean) : ['Action'];
    setEditSelectedGenres(genres.length > 0 ? genres : ['Action']);
    setEditCustomGenreInput('');
  };

  const toggleEditGenre = (genre: string) => {
    setEditSelectedGenres((prev) => {
      if (prev.includes(genre)) {
        const next = prev.filter((g) => g !== genre);
        return next.length === 0 ? [genre] : next;
      } else {
        return [...prev, genre];
      }
    });
  };

  const handleAddEditCustomGenre = () => {
    const trimmed = editCustomGenreInput.trim();
    if (!trimmed) return;
    if (!editSelectedGenres.includes(trimmed)) {
      setEditSelectedGenres((prev) => [...prev, trimmed]);
    }
    setEditCustomGenreInput('');
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Listen to Auth State
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsAdmin(false);
        setIsBanned(false);
        return;
      }

      // Check if user is jayden.gass10@gmail.com
      const isOwner = user.email?.toLowerCase() === 'jayden.gass10@gmail.com';
      if (isOwner) {
        setIsAdmin(true);
      }

      // Listen to user profile doc
      const userDocRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userDocRef, (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.role === 'admin' || isOwner) {
            setIsAdmin(true);
          }
          setIsBanned(!!data.isBanned);
        }
      });

      // Check admin collection
      const adminDocRef = doc(db, 'admins', user.uid);
      const unsubAdmin = onSnapshot(adminDocRef, (snap) => {
        if (snap.exists() || isOwner) {
          setIsAdmin(true);
        }
      });

      return () => {
        unsubUser();
        unsubAdmin();
      };
    });
    return () => unsub();
  }, []);

  // Listen to community posts
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    try {
      const q = query(collection(db, 'community_posts'), orderBy('createdAt', 'asc'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const list: CommunityPost[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              id: docSnap.id,
              tab: data.tab || 'general',
              category: data.category || (data.tab === 'bugs' ? 'bug_report' : data.tab === 'suggestions' ? 'suggestion' : data.isAnnouncement || data.tab === 'announcements' ? 'announcement' : 'chat'),
              content: data.content || '',
              imageUrl: data.imageUrl || undefined,
              authorName: data.authorName || 'Community Member',
              authorId: data.authorId || 'guest',
              authorBadge: data.authorBadge || 'MEMBER',
              authorRole: data.authorRole || 'member',
              isAnnouncement: !!data.isAnnouncement,
              createdAt: data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.createdAt || Date.now()),
            });
          });

          // Also merge legacy posts if community_posts is empty
          if (list.length === 0) {
            // Check legacy testers_chat
            getDocs(collection(db, 'testers_chat')).then((legacySnap) => {
              if (!legacySnap.empty) {
                const legacyList: CommunityPost[] = [];
                legacySnap.forEach((d) => {
                  const leg = d.data();
                  legacyList.push({
                    id: d.id,
                    tab: 'general',
                    category: 'chat',
                    content: leg.content || '',
                    imageUrl: leg.imageUrl,
                    authorName: leg.authorName || 'Tester',
                    authorId: leg.authorId || 'guest',
                    authorBadge: leg.authorBadge || 'MEMBER',
                    createdAt: leg.createdAt?.toMillis ? leg.createdAt.toMillis() : (leg.createdAt || Date.now()),
                  });
                });
                legacyList.sort((a, b) => a.createdAt - b.createdAt);
                setPosts(legacyList);
              } else {
                setPosts([]);
              }
              setLoading(false);
            }).catch(() => {
              setPosts([]);
              setLoading(false);
            });
          } else {
            setPosts(list);
            setLoading(false);
          }
        },
        (err) => {
          console.warn('Community posts snapshot error:', err);
          setErrorMessage('Firestore: ' + err.message);
          setLoading(false);
        }
      );
      return () => unsub();
    } catch (err: any) {
      console.warn('Failed to bind Firestore listener:', err);
      setLoading(false);
    }
  }, [isOpen]);

  // Ensure non-admins cannot view or stay on members tab
  useEffect(() => {
    if (activeTab === 'members' && !isAdmin) {
      setActiveTab('announcements');
    }
  }, [activeTab, isAdmin]);

  // Listen to registered members (only visible and fetched for Admins)
  useEffect(() => {
    if (!isOpen || !isAdmin) {
      setMembers([]);
      return;
    }

    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(
        q,
        (snapshot) => {
          const list: CommunityUser[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            list.push({
              uid: docSnap.id,
              username: data.username || 'Anonymous',
              email: data.email || '',
              role: data.role || 'member',
              badge: data.badge || (data.role === 'admin' ? 'ADMIN' : 'MEMBER'),
              isBanned: !!data.isBanned,
              createdAt: data.createdAt || Date.now(),
            });
          });
          setMembers(list);
        },
        (err) => {
          console.warn('Community users snapshot error:', err);
        }
      );
      return () => unsub();
    } catch (err) {
      console.warn('Failed to listen to users collection:', err);
    }
  }, [isOpen]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === 'general' || activeTab === 'announcements' || activeTab === 'bugs' || activeTab === 'suggestions') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [posts, activeTab]);

  // Image upload handling
  const processImageFile = async (file: File | Blob) => {
    try {
      setOptimizingImage(true);
      setErrorMessage(null);
      const optimizedWebp = await optimizeImageTo300x300(file);
      setStagedImage(optimizedWebp);
    } catch (err: any) {
      setErrorMessage('Failed to optimize image: ' + err.message);
    } finally {
      setOptimizingImage(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
    e.target.value = '';
  };

  // Send message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isBanned) {
      setErrorMessage('Your account is currently banned from chatting.');
      return;
    }

    if (!inputText.trim() && !stagedImage) {
      return;
    }

    const isAnnouncementTab = activeTab === 'announcements';
    if (isAnnouncementTab && !isAdmin) {
      setErrorMessage('Only administrators can post announcements.');
      return;
    }

    setSending(true);
    setErrorMessage(null);

    const authorName =
      currentUser?.displayName ||
      currentUser?.email?.split('@')[0] ||
      (isAnnouncementTab ? 'Admin' : 'Member ' + Math.floor(Math.random() * 900 + 100));
    const authorId = currentUser?.uid || 'guest';
    const authorRole = (isAdmin || isAnnouncementTab) ? 'admin' : 'member';
    const authorBadge = (isAdmin || isAnnouncementTab) ? 'ADMIN' : currentUser?.uid ? 'MEMBER' : 'GUEST';

    const postTab = activeTab === 'announcements' ? 'announcements' : activeTab === 'bugs' ? 'bugs' : activeTab === 'suggestions' ? 'suggestions' : 'general';
    const postCategory = activeTab === 'announcements' ? 'announcement' : activeTab === 'bugs' ? 'bug_report' : activeTab === 'suggestions' ? 'suggestion' : 'chat';

    try {
      await addDoc(collection(db, 'community_posts'), {
        tab: postTab,
        category: postCategory,
        isAnnouncement: isAnnouncementTab,
        content: inputText.trim(),
        imageUrl: stagedImage || null,
        authorName,
        authorId,
        authorRole,
        authorBadge,
        createdAt: serverTimestamp(),
      });

      setInputText('');
      setStagedImage(null);
    } catch (err: any) {
      console.error('Error posting message:', err);
      setErrorMessage('Failed to send message: ' + (err.message || 'Check Firestore connection.'));
    } finally {
      setSending(false);
    }
  };

  // Delete message handler (admin or author)
  const handleDeletePost = (postId: string) => {
    setConfirmDialog({
      title: 'Delete Message',
      message: 'Are you sure you want to delete this chat message?',
      confirmText: 'Delete Message',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'community_posts', postId));
          setSuccessMessage('Message deleted.');
          setTimeout(() => setSuccessMessage(null), 2500);
        } catch (err: any) {
          setErrorMessage('Failed to delete post: ' + err.message);
        }
      },
    });
  };

  // Ban/Unban member handler (Admin only)
  const handleToggleBanMember = (targetUser: CommunityUser) => {
    if (!isAdmin) return;
    const willBan = !targetUser.isBanned;
    const confirmTitle = willBan ? 'Ban Member' : 'Unban Member';
    const confirmMessage = willBan
      ? `Ban ${targetUser.username} from Community? They will not be able to chat.`
      : `Unban ${targetUser.username} so they can chat again?`;

    setConfirmDialog({
      title: confirmTitle,
      message: confirmMessage,
      confirmText: willBan ? 'Ban Member' : 'Unban Member',
      isDestructive: willBan,
      onConfirm: async () => {
        try {
          await setDoc(
            doc(db, 'users', targetUser.uid),
            {
              isBanned: willBan,
              bannedAt: willBan ? Date.now() : null,
            },
            { merge: true }
          );

          if (willBan) {
            await setDoc(doc(db, 'banned_users', targetUser.uid), {
              uid: targetUser.uid,
              username: targetUser.username,
              bannedAt: Date.now(),
              bannedBy: currentUser?.email || 'admin',
            });
          } else {
            await deleteDoc(doc(db, 'banned_users', targetUser.uid));
          }

          setSuccessMessage(willBan ? `${targetUser.username} was banned.` : `${targetUser.username} was unbanned.`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
          setErrorMessage('Failed to update ban status: ' + err.message);
        }
      },
    });
  };

  // Delete member handler (Admin only)
  const handleDeleteMember = (targetUser: CommunityUser) => {
    if (!isAdmin) return;
    setConfirmDialog({
      title: 'Delete Member Profile',
      message: `Permanently delete member profile for ${targetUser.username}? This cannot be undone.`,
      confirmText: 'Delete Member',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'users', targetUser.uid));
          await deleteDoc(doc(db, 'banned_users', targetUser.uid));
          setSuccessMessage(`Member ${targetUser.username} was removed.`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
          setErrorMessage('Failed to delete member: ' + err.message);
        }
      },
    });
  };

  // Add Game to Firebase handler (Admin only)
  const handleAddGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      setErrorMessage('Only admins can add games.');
      return;
    }

    if (!newGameName.trim() || !newGameRepo.trim()) {
      setErrorMessage('Please provide both Game Name and GitHub Repo URL.');
      return;
    }

    setAddingGame(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const genreString = selectedGenres.length > 0 ? selectedGenres.join(', ') : 'Action';
      const newGame: GameItem = {
        name: newGameName.trim(),
        repo: newGameRepo.trim(),
        subPath: newGameSubPath.trim() || undefined,
        thumbnail: newGameThumbnail.trim() || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80',
        genre: genreString,
        badge: newGameBadge,
        defaultAspectRatio: newGameAspectRatio,
        entryPoint: newGameEntryPoint.trim() || undefined,
      };

      await addGameToFirebase(newGame);
      setSuccessMessage(`Game "${newGame.name}" successfully published to Firebase!`);
      setNewGameName('');
      setNewGameRepo('');
      setNewGameSubPath('');
      setNewGameThumbnail('');
      setNewGameEntryPoint('');
      setSelectedGenres(['Action']);
      setCustomGenreInput('');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage('Failed to add game: ' + err.message);
    } finally {
      setAddingGame(false);
    }
  };

  // Save edited game to Firebase
  const handleSaveEditedGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingGame) return;

    if (!editGameName.trim() || !editGameRepo.trim()) {
      setErrorMessage('Game Name and GitHub Repository URL are required.');
      return;
    }

    setSavingEditGame(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const genreString = editSelectedGenres.length > 0 ? editSelectedGenres.join(', ') : 'Action';
      const updatedGame: GameItem = {
        name: editGameName.trim(),
        repo: editGameRepo.trim(),
        subPath: editGameSubPath.trim() || undefined,
        thumbnail: editGameThumbnail.trim() || 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80',
        genre: genreString,
        badge: editGameBadge,
        defaultAspectRatio: editGameAspectRatio,
        entryPoint: editGameEntryPoint.trim() || undefined,
      };

      await updateGameInFirebase(editingGame.name, updatedGame);

      // Invalidate local IndexedDB / Cache storage for this game so the changes apply immediately
      try {
        await deleteGameCache(slugifyGame(editingGame.name));
        if (editingGame.name !== updatedGame.name) {
          await deleteGameCache(slugifyGame(updatedGame.name));
        }
      } catch (cacheErr) {
        console.warn('Could not clear local cache for edited game:', cacheErr);
      }

      setSuccessMessage(`Game "${updatedGame.name}" updated successfully in Firebase!`);
      setEditingGame(null);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage('Failed to update game: ' + err.message);
    } finally {
      setSavingEditGame(false);
    }
  };

  // Clear single game cache
  const handleClearSingleGameCache = async (gameName: string) => {
    setClearingGameCache(true);
    try {
      await deleteGameCache(slugifyGame(gameName));
      setSuccessMessage(`Local cache for "${gameName}" cleared. It will download fresh on next launch.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      setErrorMessage('Failed to clear cache: ' + err.message);
    } finally {
      setClearingGameCache(false);
    }
  };

  // Check games count in Firebase handler
  const handleSyncAllGames = async () => {
    setSyncingGames(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await syncAllGamesToFirebase();
      setSuccessMessage(`Firebase games catalog active (${res.total} games loaded from Firestore).`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage('Failed to check games in Firebase: ' + err.message);
    } finally {
      setSyncingGames(false);
    }
  };

  // Delete game from Firebase
  const handleDeleteFirebaseGame = (gameName: string) => {
    if (!isAdmin) return;
    setConfirmDialog({
      title: 'Remove Game from Firebase',
      message: `Are you sure you want to remove "${gameName}" from Firebase?`,
      confirmText: 'Remove Game',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteGameFromFirebase(gameName);
          try {
            await deleteGameCache(slugifyGame(gameName));
          } catch {}
          setSuccessMessage(`Game "${gameName}" removed from Firebase.`);
          setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err: any) {
          setErrorMessage('Failed to delete game: ' + err.message);
        }
      },
    });
  };

  if (!isOpen) return null;

  // Announcements posts
  const announcementPosts = posts.filter(
    (p) => p.isAnnouncement || p.tab === 'announcements' || p.category === 'announcement'
  );

  // General posts
  const generalPosts = posts.filter(
    (p) => (!p.isAnnouncement && p.tab !== 'announcements' && p.category !== 'announcement' && p.tab !== 'bugs' && p.category !== 'bug_report' && p.tab !== 'suggestions' && p.category !== 'suggestion')
  );

  // Bug reports posts
  const bugPosts = posts.filter(
    (p) => p.tab === 'bugs' || p.category === 'bug_report'
  );

  // Suggestions posts
  const suggestionPosts = posts.filter(
    (p) => p.tab === 'suggestions' || p.category === 'suggestion'
  );

  // Filter members
  const filteredMembers = members.filter((m) => {
    if (!memberSearchQuery) return true;
    const q = memberSearchQuery.toLowerCase();
    return m.username.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  // Filter games for Admin management
  const filteredGames = gamesList.filter((g) => {
    if (!gameSearchQuery) return true;
    return g.name.toLowerCase().includes(gameSearchQuery.toLowerCase()) || g.genre.toLowerCase().includes(gameSearchQuery.toLowerCase());
  });

  return (
    <div
      id="community-modal-overlay"
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 sm:p-6 backdrop-blur-xs select-none"
      onPaste={handlePaste}
    >
      <div
        id="community-modal-window"
        className="w-[95vw] md:w-[82vw] h-[92vh] md:h-[82vh] max-w-6xl bg-[#0b0b0e] text-[#e0e0e3] border border-[#1e1e24] rounded-xl shadow-2xl flex flex-col overflow-hidden relative"
      >
        {/* Top Header Bar: Clean Community Brand & Navigation Tabs & Account */}
        <div className="bg-[#121216] border-b border-[#1c1c22] px-3 py-2.5 sm:px-5 flex items-center justify-between gap-3">
          {/* Left: Community Title & Tabs */}
          <div className="flex items-center gap-3 overflow-x-auto scrollbar-none">
            <div className="flex items-center gap-2 pr-3 border-r border-[#202026]">
              <span className="font-semibold text-white text-xs tracking-wider uppercase">
                Community
              </span>
            </div>

            {/* Navigation Tabs: Announcements, General, Bugs, Suggestions, Members, Admin */}
            <div className="flex items-center gap-1">
              <button
                id="community-tab-announcements"
                onClick={() => {
                  setActiveTab('announcements');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'announcements'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                }`}
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Announcements</span>
                {announcementPosts.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                      activeTab === 'announcements'
                        ? 'bg-neutral-200 text-black'
                        : 'bg-[#1e1e26] text-[#9999a2]'
                    }`}
                  >
                    {announcementPosts.length}
                  </span>
                )}
              </button>

              <button
                id="community-tab-general"
                onClick={() => {
                  setActiveTab('general');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'general'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>General</span>
              </button>

              <button
                id="community-tab-bugs"
                onClick={() => {
                  setActiveTab('bugs');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'bugs'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Bugs</span>
                {bugPosts.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                      activeTab === 'bugs'
                        ? 'bg-neutral-200 text-black'
                        : 'bg-[#1e1e26] text-[#9999a2]'
                    }`}
                  >
                    {bugPosts.length}
                  </span>
                )}
              </button>

              <button
                id="community-tab-suggestions"
                onClick={() => {
                  setActiveTab('suggestions');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'suggestions'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                }`}
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Suggestions</span>
                {suggestionPosts.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
                      activeTab === 'suggestions'
                        ? 'bg-neutral-200 text-black'
                        : 'bg-[#1e1e26] text-[#9999a2]'
                    }`}
                  >
                    {suggestionPosts.length}
                  </span>
                )}
              </button>

              {/* Members Tab - Only visible to Admins */}
              {isAdmin && (
                <button
                  id="community-tab-members"
                  onClick={() => {
                    setActiveTab('members');
                    setErrorMessage(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === 'members'
                      ? 'bg-white text-black font-semibold'
                      : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Members ({members.length})</span>
                </button>
              )}

              {/* Admin Tab - Clean styling */}
              <button
                id="community-tab-admin"
                onClick={() => {
                  setActiveTab('admin');
                  setErrorMessage(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'admin'
                    ? 'bg-white text-black font-semibold'
                    : 'text-[#88888e] hover:bg-[#1a1a20] hover:text-white'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Right: User profile badge & Close button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              id="community-account-btn"
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-1.5 bg-[#17171d] hover:bg-[#202028] border border-[#24242e] px-2.5 py-1.5 rounded-md text-xs font-medium text-white transition-colors cursor-pointer"
              title={
                currentUser
                  ? `Signed in as ${currentUser.displayName || currentUser.email} (${isAdmin ? 'Admin' : 'Member'})`
                  : 'Sign in to Community'
              }
            >
              <div className="w-4 h-4 rounded-full bg-[#252530] border border-[#353544] flex items-center justify-center text-[10px] font-bold text-white">
                {currentUser ? (currentUser.displayName || currentUser.email || 'U')[0].toUpperCase() : <UserIcon className="w-2.5 h-2.5" />}
              </div>
              <span className="max-w-[100px] truncate text-xs">
                {currentUser ? (currentUser.displayName || currentUser.email?.split('@')[0]) : 'Sign In'}
              </span>
              {isAdmin && (
                <span className="bg-[#242430] text-[#c0c0ca] text-[9px] font-semibold px-1 py-0.2 rounded border border-[#343444]">
                  Admin
                </span>
              )}
            </button>

            <button
              id="community-close-btn"
              onClick={onClose}
              className="text-[#88888e] hover:text-white p-1.5 rounded-md hover:bg-[#1a1a20] transition-colors cursor-pointer"
              title="Close Community"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div className="bg-[#2b1416] border-b border-[#461e22] px-4 py-2 text-[#ff8080] text-xs flex items-center justify-between shrink-0">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)} className="text-[#ff8080] hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="bg-[#14261a] border-b border-[#1f422b] px-4 py-2 text-[#66e088] text-xs flex items-center justify-between shrink-0">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-[#66e088] hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ================= TAB 0: ANNOUNCEMENTS ================= */}
        {activeTab === 'announcements' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0b0b0e]">
            {/* Announcements Feed */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[#0b0b0e]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span className="text-xs">Loading announcements...</span>
                </div>
              ) : announcementPosts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16 text-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full bg-[#141418] border border-[#22222a] flex items-center justify-center text-[#70707a]">
                    <Megaphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">No announcements yet</h4>
                    <p className="text-xs text-[#77777d] mt-1">
                      Official updates and release notes from administrators will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                announcementPosts.map((post) => {
                  const formattedDate = new Date(post.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const isAuthor = currentUser?.uid && post.authorId === currentUser.uid;
                  const canDelete = isAdmin || isAuthor;

                  return (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#121217] transition-colors group relative"
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-[#181822] border border-[#262634] text-white flex items-center justify-center text-xs font-semibold shrink-0 select-none mt-0.5">
                        {(post.authorName || 'A')[0].toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header: Name + Admin Badge + Timestamp + Delete Button */}
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-xs">
                              {post.authorName}
                            </span>
                            <span className="bg-[#1c1c24] border border-[#2b2b38] text-[#b0b0b8] text-[9px] font-medium px-1.5 py-0.2 rounded">
                              Admin
                            </span>
                            <span className="text-[10px] text-[#666670]">{formattedDate}</span>
                          </div>

                          {canDelete && (
                            <button
                              id={`delete-announcement-${post.id}`}
                              onClick={() => handleDeletePost(post.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#77777d] hover:text-red-400 hover:bg-[#201518] rounded transition-all cursor-pointer"
                              title="Delete Announcement"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Content */}
                        {post.content && (
                          <p className="text-xs text-[#d0d0d5] break-words whitespace-pre-wrap leading-relaxed">
                            {post.content}
                          </p>
                        )}

                        {/* Image Attachment Preview */}
                        {post.imageUrl && (
                          <div className="mt-1.5 relative inline-block">
                            <img
                              src={post.imageUrl}
                              alt="Announcement attachment"
                              className="max-w-[280px] max-h-[280px] rounded-md border border-[#202028] object-contain bg-[#121216] cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                            />
                            <button
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                              className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-black text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                              title="Expand image"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Admin composer or Non-admin notice */}
            {isAdmin ? (
              <div className="bg-[#0e0e12] p-3 border-t border-[#1a1a20] shrink-0">
                {stagedImage && (
                  <div className="mb-2 p-2 bg-[#141418] rounded-lg border border-[#22222a] flex items-center justify-between w-fit gap-3">
                    <img
                      src={stagedImage}
                      alt="Staged attachment"
                      className="w-12 h-12 object-cover rounded border border-[#22222a]"
                    />
                    <div className="text-xs">
                      <p className="font-medium text-white">Image attached</p>
                      <p className="text-[10px] text-[#77777d]">Ready to publish</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStagedImage(null)}
                      className="p-1 text-[#88888e] hover:text-white rounded hover:bg-[#1e1e24] transition-colors cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 bg-[#141418] rounded-lg px-3 py-2 border border-[#22222a] focus-within:border-[#3f3f4e] transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={optimizingImage || sending}
                    className="w-7 h-7 rounded-md bg-[#1e1e26] hover:bg-[#282834] text-[#cccccc] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Attach image"
                  >
                    {optimizingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>

                  <textarea
                    rows={2}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!sending && (inputText.trim() || stagedImage)) {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Publish an announcement to the community... (Shift+Enter for newline)"
                    className="flex-1 bg-transparent text-white text-xs focus:outline-none placeholder-[#666670] resize-none leading-relaxed"
                  />

                  <button
                    type="submit"
                    disabled={sending || (!inputText.trim() && !stagedImage)}
                    className="px-3 py-1.5 rounded-md bg-white hover:bg-[#e0e0e0] text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0 self-end mb-0.5"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-black" />
                    )}
                    <span>Publish</span>
                  </button>
                </form>
              </div>
            ) : (
              <div className="p-3 border-t border-[#1a1a20] bg-[#0c0c0f] text-center text-xs text-[#6e6e76]">
                Only administrators can post announcements.
              </div>
            )}
          </div>
        )}

        {/* ================= TAB 1: GENERAL (CHAT) ================= */}
        {activeTab === 'general' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0b0b0e]">
            {/* If banned, show alert banner */}
            {isBanned && (
              <div className="bg-[#251315] border-b border-[#441a1e] px-4 py-2 text-red-400 text-xs flex items-center gap-2 shrink-0">
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>Your account has been banned from community chat by an administrator.</span>
              </div>
            )}

            {/* Messages Feed */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[#0b0b0e]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span className="text-xs">Loading community chat...</span>
                </div>
              ) : generalPosts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16 text-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full bg-[#141418] border border-[#22222a] flex items-center justify-center text-[#66666e]">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">Welcome to General!</h4>
                    <p className="text-xs text-[#77777d] mt-1">
                      No messages yet. Send a message to start the conversation!
                    </p>
                  </div>
                </div>
              ) : (
                generalPosts.map((post) => {
                  const formattedDate = new Date(post.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const isAuthor = currentUser?.uid && post.authorId === currentUser.uid;
                  const canDelete = isAdmin || isAuthor;

                  return (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 p-2 rounded-lg hover:bg-[#121217] transition-colors group relative"
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-[#181822] border border-[#262634] text-white flex items-center justify-center text-xs font-semibold shrink-0 select-none mt-0.5">
                        {(post.authorName || 'M')[0].toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header: Name + Admin Badge + Timestamp + Delete Button */}
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-xs">
                              {post.authorName}
                            </span>

                            {post.authorRole === 'admin' && (
                              <span className="bg-[#1c1c24] border border-[#2b2b38] text-[#b0b0b8] text-[9px] font-medium px-1.5 py-0.2 rounded">
                                Admin
                              </span>
                            )}

                            <span className="text-[10px] text-[#666670]">
                              {formattedDate}
                            </span>
                          </div>

                          {/* Admin or Author Delete Chat Button */}
                          {canDelete && (
                            <button
                              id={`delete-post-${post.id}`}
                              onClick={() => handleDeletePost(post.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#77777d] hover:text-red-400 hover:bg-[#201518] rounded transition-all cursor-pointer"
                              title="Delete Message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Text Message Content */}
                        {post.content && (
                          <p className="text-xs text-[#d0d0d5] break-words whitespace-pre-wrap leading-relaxed">
                            {post.content}
                          </p>
                        )}

                        {/* Image Attachment Preview */}
                        {post.imageUrl && (
                          <div className="mt-1.5 relative inline-block">
                            <img
                              src={post.imageUrl}
                              alt="Attachment"
                              className="max-w-[280px] max-h-[280px] rounded-md border border-[#202028] object-contain bg-[#121216] cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                            />
                            <button
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                              className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-black text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                              title="Expand image"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <div className="bg-[#0e0e12] p-3 border-t border-[#1a1a20] shrink-0">
              {/* Staged Image Preview */}
              {stagedImage && (
                <div className="mb-2 p-2 bg-[#141418] rounded-lg border border-[#22222a] flex items-center justify-between w-fit gap-3">
                  <div className="relative">
                    <img
                      src={stagedImage}
                      alt="Staged attachment"
                      className="w-12 h-12 object-cover rounded border border-[#22222a]"
                    />
                  </div>
                  <div className="text-xs">
                    <p className="font-medium text-white">Image attached</p>
                    <p className="text-[10px] text-[#77777d]">Ready to send</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStagedImage(null)}
                    className="p-1 text-[#88888e] hover:text-white rounded hover:bg-[#1e1e24] transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Message Composer Controls */}
              {isBanned ? (
                <div className="p-2.5 bg-[#251315] border border-[#441a1e] rounded-lg text-red-400 text-xs text-center flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" />
                  <span>Your account has been banned from community chat by an administrator.</span>
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 bg-[#141418] rounded-lg px-3 py-2 border border-[#22222a] focus-within:border-[#3f3f4e] transition-colors"
                >
                  {/* Image Attachment Button */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  <button
                    type="button"
                    id="community-upload-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={optimizingImage || sending}
                    className="w-7 h-7 rounded-md bg-[#1e1e26] hover:bg-[#282834] text-[#cccccc] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Attach image (or paste Ctrl+V)"
                  >
                    {optimizingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>

                  {/* Message input */}
                  <textarea
                    rows={1}
                    id="community-message-input"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!sending && (inputText.trim() || stagedImage)) {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Message in #general... (Shift+Enter for newline)"
                    className="flex-1 bg-transparent text-white text-xs focus:outline-none placeholder-[#666670] resize-none leading-relaxed max-h-24"
                  />

                  {/* Send Button */}
                  <button
                    type="submit"
                    id="community-send-btn"
                    disabled={sending || (!inputText.trim() && !stagedImage)}
                    className="px-3 py-1.5 rounded-md bg-white hover:bg-[#e0e0e0] text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-black" />
                    )}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB: BUGS (BUG REPORTS) ================= */}
        {activeTab === 'bugs' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0b0b0e]">
            {isBanned && (
              <div className="bg-[#251315] border-b border-[#441a1e] px-4 py-2 text-red-400 text-xs flex items-center gap-2 shrink-0">
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>Your account has been banned from community chat by an administrator.</span>
              </div>
            )}

            {/* Header info banner */}
            <div className="px-4 py-2 bg-[#121217] border-b border-[#1c1c22] flex items-center justify-between text-xs text-[#888892]">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Report games that aren't working or site errors so we can fix them!</span>
              </div>
              <span className="text-[10px] text-[#666670]">{bugPosts.length} report{bugPosts.length === 1 ? '' : 's'}</span>
            </div>

            {/* Bugs Feed */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[#0b0b0e]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span className="text-xs">Loading bug reports...</span>
                </div>
              ) : bugPosts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16 text-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full bg-[#141418] border border-[#22222a] flex items-center justify-center text-amber-400/80">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">No bug reports yet</h4>
                    <p className="text-xs text-[#77777d] mt-1">
                      Encountered a broken game or bug? Post details here and the dev team will fix it.
                    </p>
                  </div>
                </div>
              ) : (
                bugPosts.map((post) => {
                  const formattedDate = new Date(post.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const isAuthor = currentUser?.uid && post.authorId === currentUser.uid;
                  const canDelete = isAdmin || isAuthor;

                  return (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 p-2.5 rounded-lg bg-[#101015] border border-[#1a1a22] hover:border-[#282834] transition-colors group relative"
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-semibold shrink-0 select-none mt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header: Name + Badge + Timestamp + Delete */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-xs">
                              {post.authorName}
                            </span>
                            <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[9px] font-medium px-1.5 py-0.2 rounded">
                              Bug Report
                            </span>
                            {post.authorRole === 'admin' && (
                              <span className="bg-[#1c1c24] border border-[#2b2b38] text-[#b0b0b8] text-[9px] font-medium px-1.5 py-0.2 rounded">
                                Admin
                              </span>
                            )}
                            <span className="text-[10px] text-[#666670]">{formattedDate}</span>
                          </div>

                          {canDelete && (
                            <button
                              id={`delete-bug-${post.id}`}
                              onClick={() => handleDeletePost(post.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#77777d] hover:text-red-400 hover:bg-[#201518] rounded transition-all cursor-pointer"
                              title="Delete Report"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Content */}
                        {post.content && (
                          <p className="text-xs text-[#d0d0d5] break-words whitespace-pre-wrap leading-relaxed">
                            {post.content}
                          </p>
                        )}

                        {/* Image Attachment Preview */}
                        {post.imageUrl && (
                          <div className="mt-2 relative inline-block">
                            <img
                              src={post.imageUrl}
                              alt="Bug screenshot"
                              className="max-w-[280px] max-h-[280px] rounded-md border border-[#202028] object-contain bg-[#121216] cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                            />
                            <button
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                              className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-black text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                              title="Expand image"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bug Input Bar */}
            <div className="bg-[#0e0e12] p-3 border-t border-[#1a1a20] shrink-0">
              {stagedImage && (
                <div className="mb-2 p-2 bg-[#141418] rounded-lg border border-[#22222a] flex items-center justify-between w-fit gap-3">
                  <img
                    src={stagedImage}
                    alt="Staged attachment"
                    className="w-12 h-12 object-cover rounded border border-[#22222a]"
                  />
                  <div className="text-xs">
                    <p className="font-medium text-white">Screenshot attached</p>
                    <p className="text-[10px] text-[#77777d]">Ready to submit</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStagedImage(null)}
                    className="p-1 text-[#88888e] hover:text-white rounded hover:bg-[#1e1e24] transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {isBanned ? (
                <div className="p-2.5 bg-[#251315] border border-[#441a1e] rounded-lg text-red-400 text-xs text-center flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" />
                  <span>Your account has been banned from submitting bug reports.</span>
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 bg-[#141418] rounded-lg px-3 py-2 border border-[#22222a] focus-within:border-[#3f3f4e] transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={optimizingImage || sending}
                    className="w-7 h-7 rounded-md bg-[#1e1e26] hover:bg-[#282834] text-[#cccccc] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Attach screenshot (or paste Ctrl+V)"
                  >
                    {optimizingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>

                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!sending && (inputText.trim() || stagedImage)) {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Describe the bug or broken game... (Shift+Enter for newline)"
                    className="flex-1 bg-transparent text-white text-xs focus:outline-none placeholder-[#666670] resize-none leading-relaxed max-h-24"
                  />

                  <button
                    type="submit"
                    disabled={sending || (!inputText.trim() && !stagedImage)}
                    className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-black" />
                    )}
                    <span className="hidden sm:inline">Report Bug</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB: SUGGESTIONS ================= */}
        {activeTab === 'suggestions' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0b0b0e]">
            {isBanned && (
              <div className="bg-[#251315] border-b border-[#441a1e] px-4 py-2 text-red-400 text-xs flex items-center gap-2 shrink-0">
                <Ban className="w-3.5 h-3.5 shrink-0" />
                <span>Your account has been banned from community chat by an administrator.</span>
              </div>
            )}

            {/* Header info banner */}
            <div className="px-4 py-2 bg-[#121217] border-b border-[#1c1c22] flex items-center justify-between text-xs text-[#888892]">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-3.5 h-3.5 text-sky-400" />
                <span>Request new games or features you'd love to see added to the site!</span>
              </div>
              <span className="text-[10px] text-[#666670]">{suggestionPosts.length} suggestion{suggestionPosts.length === 1 ? '' : 's'}</span>
            </div>

            {/* Suggestions Feed */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[#0b0b0e]">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                  <span className="text-xs">Loading suggestions...</span>
                </div>
              ) : suggestionPosts.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-[#77777d] gap-2 py-16 text-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-full bg-[#141418] border border-[#22222a] flex items-center justify-center text-sky-400/80">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm">No suggestions yet</h4>
                    <p className="text-xs text-[#77777d] mt-1">
                      Have a game request or idea for the site? Drop your suggestions here!
                    </p>
                  </div>
                </div>
              ) : (
                suggestionPosts.map((post) => {
                  const formattedDate = new Date(post.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  const isAuthor = currentUser?.uid && post.authorId === currentUser.uid;
                  const canDelete = isAdmin || isAuthor;

                  return (
                    <div
                      key={post.id}
                      className="flex items-start gap-3 p-2.5 rounded-lg bg-[#101015] border border-[#1a1a22] hover:border-[#282834] transition-colors group relative"
                    >
                      {/* Avatar */}
                      <div className="w-7 h-7 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-semibold shrink-0 select-none mt-0.5">
                        <Lightbulb className="w-3.5 h-3.5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        {/* Header: Name + Badge + Timestamp + Delete */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-white text-xs">
                              {post.authorName}
                            </span>
                            <span className="bg-sky-500/10 border border-sky-500/30 text-sky-400 text-[9px] font-medium px-1.5 py-0.2 rounded">
                              Suggestion
                            </span>
                            {post.authorRole === 'admin' && (
                              <span className="bg-[#1c1c24] border border-[#2b2b38] text-[#b0b0b8] text-[9px] font-medium px-1.5 py-0.2 rounded">
                                Admin
                              </span>
                            )}
                            <span className="text-[10px] text-[#666670]">{formattedDate}</span>
                          </div>

                          {canDelete && (
                            <button
                              id={`delete-suggestion-${post.id}`}
                              onClick={() => handleDeletePost(post.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-[#77777d] hover:text-red-400 hover:bg-[#201518] rounded transition-all cursor-pointer"
                              title="Delete Suggestion"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Content */}
                        {post.content && (
                          <p className="text-xs text-[#d0d0d5] break-words whitespace-pre-wrap leading-relaxed">
                            {post.content}
                          </p>
                        )}

                        {/* Image Attachment Preview */}
                        {post.imageUrl && (
                          <div className="mt-2 relative inline-block">
                            <img
                              src={post.imageUrl}
                              alt="Suggestion attachment"
                              className="max-w-[280px] max-h-[280px] rounded-md border border-[#202028] object-contain bg-[#121216] cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                            />
                            <button
                              onClick={() => setSelectedPreviewImage(post.imageUrl || null)}
                              className="absolute top-1.5 right-1.5 p-1 bg-black/75 hover:bg-black text-white rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 cursor-pointer"
                              title="Expand image"
                            >
                              <Maximize2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Suggestions Input Bar */}
            <div className="bg-[#0e0e12] p-3 border-t border-[#1a1a20] shrink-0">
              {stagedImage && (
                <div className="mb-2 p-2 bg-[#141418] rounded-lg border border-[#22222a] flex items-center justify-between w-fit gap-3">
                  <img
                    src={stagedImage}
                    alt="Staged attachment"
                    className="w-12 h-12 object-cover rounded border border-[#22222a]"
                  />
                  <div className="text-xs">
                    <p className="font-medium text-white">Image attached</p>
                    <p className="text-[10px] text-[#77777d]">Ready to submit</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStagedImage(null)}
                    className="p-1 text-[#88888e] hover:text-white rounded hover:bg-[#1e1e24] transition-colors cursor-pointer"
                    title="Remove image"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {isBanned ? (
                <div className="p-2.5 bg-[#251315] border border-[#441a1e] rounded-lg text-red-400 text-xs text-center flex items-center justify-center gap-2">
                  <Ban className="w-4 h-4" />
                  <span>Your account has been banned from submitting suggestions.</span>
                </div>
              ) : (
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-center gap-2 bg-[#141418] rounded-lg px-3 py-2 border border-[#22222a] focus-within:border-[#3f3f4e] transition-colors"
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileInputChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={optimizingImage || sending}
                    className="w-7 h-7 rounded-md bg-[#1e1e26] hover:bg-[#282834] text-[#cccccc] hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    title="Attach reference image (or paste Ctrl+V)"
                  >
                    {optimizingImage ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>

                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (!sending && (inputText.trim() || stagedImage)) {
                          handleSendMessage();
                        }
                      }
                    }}
                    placeholder="Suggest a game, feature or improvement... (Shift+Enter for newline)"
                    className="flex-1 bg-transparent text-white text-xs focus:outline-none placeholder-[#666670] resize-none leading-relaxed max-h-24"
                  />

                  <button
                    type="submit"
                    disabled={sending || (!inputText.trim() && !stagedImage)}
                    className="px-3 py-1.5 rounded-md bg-sky-500 hover:bg-sky-400 text-black font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-black" />
                    )}
                    <span className="hidden sm:inline">Suggest</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 2: MEMBERS (Admin Only) ================= */}
        {activeTab === 'members' && isAdmin && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#0b0b0e] p-4 sm:p-6 overflow-y-auto">
            <div className="flex items-center justify-between gap-3 mb-4 pb-3 border-b border-[#1c1c22]">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-white" />
                  Community Members
                </h3>
                <p className="text-xs text-[#77777d]">
                  {members.length} registered member{members.length === 1 ? '' : 's'}.
                  {isAdmin && ' As an Admin, you can ban or remove members.'}
                </p>
              </div>

              {/* Search members */}
              <div className="w-48 sm:w-64">
                <input
                  type="text"
                  placeholder="Search members..."
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  className="w-full bg-[#121216] border border-[#222228] text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-white"
                />
              </div>
            </div>

            {/* Member List Table / Grid */}
            <div className="flex flex-col gap-2">
              {filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-[#77777d] text-xs">
                  No community members found.
                </div>
              ) : (
                filteredMembers.map((member) => {
                  const isSelf = currentUser?.uid === member.uid;
                  const memberIsAdmin = member.role === 'admin' || member.email?.toLowerCase() === 'jayden.gass10@gmail.com';

                  return (
                    <div
                      key={member.uid}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        member.isBanned
                          ? 'bg-[#1b1213] border-red-900/40'
                          : memberIsAdmin
                          ? 'bg-[#16140f] border-amber-500/20'
                          : 'bg-[#111115] border-[#1d1d24]'
                      }`}
                    >
                      {/* Left: Avatar + Details */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                            memberIsAdmin
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : member.isBanned
                              ? 'bg-red-900/20 text-red-400 border border-red-800'
                              : 'bg-[#1e1e26] text-white border border-[#2d2d38]'
                          }`}
                        >
                          {(member.username || 'U')[0].toUpperCase()}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white text-xs truncate">
                              {member.username}
                            </span>

                            {memberIsAdmin ? (
                              <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Crown className="w-2.5 h-2.5" /> ADMIN
                              </span>
                            ) : (
                              <span className="bg-[#181820] border border-[#262632] text-[#88888e] text-[9px] font-medium px-1.5 py-0.5 rounded">
                                MEMBER
                              </span>
                            )}

                            {member.isBanned && (
                              <span className="bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Ban className="w-2.5 h-2.5" /> BANNED
                              </span>
                            )}
                          </div>

                          <p className="text-[11px] text-[#66666e] truncate">
                            {member.email || 'No email'}
                          </p>
                        </div>
                      </div>

                      {/* Right: Admin Action Controls */}
                      {isAdmin && !isSelf && (
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Ban / Unban Button */}
                          <button
                            id={`ban-member-${member.uid}`}
                            onClick={() => handleToggleBanMember(member)}
                            className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors cursor-pointer flex items-center gap-1 ${
                              member.isBanned
                                ? 'bg-[#182618] border-green-800 text-green-300 hover:bg-green-900/30'
                                : 'bg-[#261616] border-red-900/50 text-red-300 hover:bg-red-900/30'
                            }`}
                            title={member.isBanned ? 'Unban Member' : 'Ban Member'}
                          >
                            <Ban className="w-3 h-3" />
                            <span>{member.isBanned ? 'Unban' : 'Ban'}</span>
                          </button>

                          {/* Delete Member Button */}
                          <button
                            id={`delete-member-${member.uid}`}
                            onClick={() => handleDeleteMember(member)}
                            className="p-1.5 rounded bg-[#1e1516] hover:bg-red-950 text-[#cc6666] hover:text-red-300 border border-red-950 transition-colors cursor-pointer"
                            title="Delete Member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: ADMIN (ADD GAMES & MANAGE FIREBASE) ================= */}
        {activeTab === 'admin' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#0b0b0e] flex flex-col gap-5">
            {!isAdmin ? (
              <div className="max-w-sm mx-auto my-auto text-center p-6 bg-[#111115] border border-[#1e1e24] rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-[#181820] border border-[#262632] text-[#8e8e98] mx-auto flex items-center justify-center mb-3">
                  <Shield className="w-5 h-5 text-[#9e9ea8]" />
                </div>
                <h3 className="text-sm font-semibold text-white mb-1">Admin Access Required</h3>
                <p className="text-xs text-[#787882] mb-5 leading-relaxed">
                  Sign in with an administrator account to manage catalog games and community settings.
                </p>
                <button
                  id="admin-portal-claim-btn"
                  onClick={() => setShowAuthModal(true)}
                  className="bg-white hover:bg-[#e4e4e7] text-black px-4 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer inline-flex items-center gap-1.5"
                >
                  <span>Sign In as Admin</span>
                </button>
              </div>
            ) : (
              <>
                {/* Admin Status Banner & Sync All Games */}
                <div className="p-4 bg-[#111115] border border-[#1e1e24] rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">Admin Management</h3>
                    <p className="text-xs text-[#787882] mt-0.5">
                      Add games to Firebase and sync catalog database records.
                    </p>
                  </div>

                  {/* Sync All Games Button */}
                  <button
                    id="admin-sync-games-btn"
                    onClick={handleSyncAllGames}
                    disabled={syncingGames}
                    className="bg-[#181820] hover:bg-[#22222a] border border-[#282834] text-white px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    title="Check catalog games stored in Firebase"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingGames ? 'animate-spin' : ''}`} />
                    <span>{syncingGames ? 'Checking...' : 'Refresh Catalog from Firebase'}</span>
                  </button>
                </div>

                {/* Section 1: Add New Game to Firebase Form */}
                <div className="p-5 bg-[#111115] border border-[#1e1e24] rounded-xl">
                  <h4 className="text-xs font-semibold text-white flex items-center gap-2 mb-3">
                    <Gamepad2 className="w-4 h-4 text-[#8e8e98]" />
                    <span>Add Game to Firebase</span>
                  </h4>

                  <form onSubmit={handleAddGame} className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Game Name */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#787882] mb-1">
                        Game Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Celeste"
                        value={newGameName}
                        onChange={(e) => setNewGameName(e.target.value)}
                        className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                      />
                    </div>

                    {/* GitHub Repo URL */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#787882] mb-1">
                        GitHub Repository URL *
                      </label>
                      <input
                        type="url"
                        required
                        placeholder="https://github.com/owner/game-repo"
                        value={newGameRepo}
                        onChange={(e) => setNewGameRepo(e.target.value)}
                        className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                      />
                    </div>

                    {/* Thumbnail URL */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#787882] mb-1">
                        Thumbnail Image URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://example.com/cover.jpg"
                        value={newGameThumbnail}
                        onChange={(e) => setNewGameThumbnail(e.target.value)}
                        className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                      />
                    </div>

                    {/* Multi-Choice Genres */}
                    <div className="md:col-span-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-[11px] font-medium text-[#787882]">
                          Select Genres *
                        </label>
                        <span className="text-[10px] text-[#8e8e98] truncate max-w-[240px]">
                          Active: <span className="text-white font-medium">{selectedGenres.join(', ')}</span>
                        </span>
                      </div>

                      {/* Genre Pills Toggle */}
                      <div className="flex flex-wrap gap-1.5 p-2 bg-[#141419] border border-[#22222a] rounded-lg max-h-36 overflow-y-auto">
                        {AVAILABLE_GENRES.map((g) => {
                          const isSelected = selectedGenres.includes(g);
                          return (
                            <button
                              key={g}
                              type="button"
                              onClick={() => toggleGenre(g)}
                              className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 select-none ${
                                isSelected
                                  ? 'bg-white text-black font-semibold shadow-sm'
                                  : 'bg-[#1c1c24] text-[#a0a0aa] hover:text-white hover:bg-[#252530] border border-transparent'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                              <span>{g}</span>
                            </button>
                          );
                        })}

                        {/* Display custom user-added genres if any */}
                        {selectedGenres
                          .filter((g) => !AVAILABLE_GENRES.includes(g))
                          .map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => toggleGenre(g)}
                              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-black transition-colors cursor-pointer flex items-center gap-1.5 select-none"
                            >
                              <Check className="w-3 h-3 text-black stroke-[3]" />
                              <span>{g}</span>
                            </button>
                          ))}
                      </div>

                      {/* Add Custom Genre Tag */}
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          placeholder="Add custom tag (e.g. Roguelike, Fighting)..."
                          value={customGenreInput}
                          onChange={(e) => setCustomGenreInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddCustomGenre();
                            }
                          }}
                          className="flex-1 bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                        />
                        <button
                          type="button"
                          onClick={handleAddCustomGenre}
                          disabled={!customGenreInput.trim()}
                          className="px-3 py-1.5 rounded-lg bg-[#1e1e26] hover:bg-[#282834] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                        >
                          + Add Tag
                        </button>
                      </div>
                    </div>

                    {/* Performance Tier & Aspect Ratio */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[#787882] mb-1">
                          Performance Badge
                        </label>
                        <select
                          value={newGameBadge}
                          onChange={(e) => setNewGameBadge(e.target.value)}
                          className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                          <option value="Ultra Low">Ultra Low</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#787882] mb-1">
                          Default Aspect Ratio
                        </label>
                        <select
                          value={newGameAspectRatio}
                          onChange={(e: any) => setNewGameAspectRatio(e.target.value)}
                          className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                        >
                          <option value="fill">Fill (Auto)</option>
                          <option value="16:9">16:9 Widescreen</option>
                          <option value="4:3">4:3 Retro</option>
                          <option value="9:16">9:16 Mobile</option>
                        </select>
                      </div>
                    </div>

                    {/* Sub-directory Path & Entry Point */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-[#787882] mb-1">
                          Sub-directory Path (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. web-ports/game"
                          value={newGameSubPath}
                          onChange={(e) => setNewGameSubPath(e.target.value)}
                          className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-[#787882] mb-1">
                          Entry Point (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="index.html (default)"
                          value={newGameEntryPoint}
                          onChange={(e) => setNewGameEntryPoint(e.target.value)}
                          className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <div className="md:col-span-2 pt-1">
                      <button
                        type="submit"
                        disabled={addingGame}
                        className="w-full bg-white hover:bg-[#e4e4e7] text-black py-2 px-4 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {addingGame ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                            <span>Adding to Firebase...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-3.5 h-3.5 text-black" />
                            <span>Add Game to Firebase</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Section 2: Manage Existing Games in Firebase */}
                <div className="p-5 bg-[#111115] border border-[#1e1e24] rounded-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <h4 className="text-xs font-semibold text-white">
                        Games in Catalog ({gamesList.length})
                      </h4>
                      <p className="text-xs text-[#787882]">
                        Review, edit configurations, or remove games in the database.
                      </p>
                    </div>

                    <div className="w-full sm:w-56">
                      <input
                        type="text"
                        placeholder="Search games..."
                        value={gameSearchQuery}
                        onChange={(e) => setGameSearchQuery(e.target.value)}
                        className="w-full bg-[#15151b] border border-[#22222a] text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-[#4b4b5a]"
                      />
                    </div>
                  </div>

                  {/* Games Grid List */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                    {filteredGames.map((game) => (
                      <div
                        key={game.name}
                        className="p-2.5 bg-[#15151b] border border-[#22222a] rounded-lg flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {game.thumbnail ? (
                            <img
                              src={game.thumbnail}
                              alt={game.name}
                              className="w-9 h-9 object-cover rounded bg-black shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded bg-[#1f1f27] flex items-center justify-center shrink-0">
                              <Gamepad2 className="w-4 h-4 text-[#88888e]" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {game.name}
                            </p>
                            <p className="text-[10px] text-[#787882] truncate">
                              {game.genre} • {game.badge}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartEditGame(game)}
                            className="p-1.5 text-[#a0a0aa] hover:text-white hover:bg-[#22222d] rounded transition-colors cursor-pointer"
                            title={`Edit ${game.name} configuration`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteFirebaseGame(game.name)}
                            className="p-1.5 text-[#787882] hover:text-red-400 hover:bg-[#251518] rounded transition-colors cursor-pointer"
                            title={`Delete ${game.name} from Firebase`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Full Image Preview Modal */}
        {selectedPreviewImage && (
          <div
            className="fixed inset-0 z-60 bg-black/90 flex items-center justify-center p-4 cursor-pointer"
            onClick={() => setSelectedPreviewImage(null)}
          >
            <div className="relative max-w-4xl max-h-[85vh] p-2 bg-[#121216] border border-[#292934] rounded-xl overflow-hidden">
              <img
                src={selectedPreviewImage}
                alt="Enlarged screenshot"
                className="max-w-full max-h-[80vh] object-contain rounded-lg"
              />
              <button
                onClick={() => setSelectedPreviewImage(null)}
                className="absolute top-4 right-4 bg-black/75 hover:bg-black text-white p-2 rounded-full cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Edit Game Modal */}
        {editingGame && (
          <div
            className="fixed inset-0 z-70 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingGame(null);
            }}
          >
            <div className="relative w-full max-w-2xl bg-[#121217] border border-[#282836] rounded-xl shadow-2xl p-6 text-white max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#22222d]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#1c1c26] border border-[#2a2a38] rounded-lg text-white">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Edit Game: {editingGame.name}
                    </h3>
                    <p className="text-xs text-[#888894]">
                      Update repository path, entry points, layout, or reset cached files.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingGame(null)}
                  className="p-1.5 text-[#888894] hover:text-white hover:bg-[#1f1f2a] rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditedGame} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      Game Name *
                    </label>
                    <input
                      type="text"
                      value={editGameName}
                      onChange={(e) => setEditGameName(e.target.value)}
                      required
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      GitHub Repo URL *
                    </label>
                    <input
                      type="text"
                      value={editGameRepo}
                      onChange={(e) => setEditGameRepo(e.target.value)}
                      required
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      Sub-directory Path (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. web-ports/game or leave blank"
                      value={editGameSubPath}
                      onChange={(e) => setEditGameSubPath(e.target.value)}
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                    <span className="text-[10px] text-[#6d6d7a] block mt-0.5">
                      Relative folder inside the repo if files are in a subfolder.
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      Entry Point (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="index.html (default)"
                      value={editGameEntryPoint}
                      onChange={(e) => setEditGameEntryPoint(e.target.value)}
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                    <span className="text-[10px] text-[#6d6d7a] block mt-0.5">
                      Main file to launch (e.g. index.html, game.html).
                    </span>
                  </div>
                </div>

                {/* Thumbnail input & preview */}
                <div>
                  <label className="block text-[11px] font-medium text-[#888894] mb-1">
                    Thumbnail Image URL
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editGameThumbnail}
                      onChange={(e) => setEditGameThumbnail(e.target.value)}
                      placeholder="https://images.unsplash.com/... or leave blank"
                      className="flex-1 bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                    <div className="w-10 h-10 rounded-lg bg-[#1a1a24] border border-[#2a2a3a] overflow-hidden shrink-0 flex items-center justify-center">
                      {editGameThumbnail ? (
                        <img
                          src={editGameThumbnail}
                          alt="Preview"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Gamepad2 className="w-4 h-4 text-[#666675]" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Genre Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-medium text-[#888894]">
                      Game Genres / Tags
                    </label>
                    <span className="text-[11px] text-[#888894]">
                      Selected: <span className="text-white font-medium">{editSelectedGenres.join(', ')}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 p-2 bg-[#14141a] border border-[#22222d] rounded-lg max-h-32 overflow-y-auto">
                    {AVAILABLE_GENRES.map((g) => {
                      const isSelected = editSelectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleEditGenre(g)}
                          className={`px-2.5 py-1 rounded-md text-[11px] transition-colors cursor-pointer flex items-center gap-1.5 select-none ${
                            isSelected
                              ? 'bg-white text-black font-semibold shadow-sm'
                              : 'bg-[#1c1c24] text-[#a0a0aa] hover:text-white hover:bg-[#252530] border border-transparent'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                          <span>{g}</span>
                        </button>
                      );
                    })}
                    {editSelectedGenres
                      .filter((g) => !AVAILABLE_GENRES.includes(g))
                      .map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleEditGenre(g)}
                          className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white text-black transition-colors cursor-pointer flex items-center gap-1.5 select-none"
                        >
                          <Check className="w-3 h-3 text-black stroke-[3]" />
                          <span>{g}</span>
                        </button>
                      ))}
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      placeholder="Add custom tag (e.g. Roguelike)..."
                      value={editCustomGenreInput}
                      onChange={(e) => setEditCustomGenreInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddEditCustomGenre();
                        }
                      }}
                      className="flex-1 bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-1.5 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    />
                    <button
                      type="button"
                      onClick={handleAddEditCustomGenre}
                      disabled={!editCustomGenreInput.trim()}
                      className="px-3 py-1.5 rounded-lg bg-[#1f1f2a] hover:bg-[#2a2a38] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                    >
                      + Add Tag
                    </button>
                  </div>
                </div>

                {/* Badge and Aspect Ratio */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      Performance Badge
                    </label>
                    <select
                      value={editGameBadge}
                      onChange={(e) => setEditGameBadge(e.target.value)}
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Ultra Low">Ultra Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#888894] mb-1">
                      Default Aspect Ratio
                    </label>
                    <select
                      value={editGameAspectRatio}
                      onChange={(e: any) => setEditGameAspectRatio(e.target.value)}
                      className="w-full bg-[#16161d] border border-[#262633] text-white text-xs px-3 py-2 rounded-lg focus:outline-none focus:border-[#4e4e63]"
                    >
                      <option value="fill">Fill (Auto / Responsive)</option>
                      <option value="16:9">16:9 Widescreen</option>
                      <option value="4:3">4:3 Retro</option>
                      <option value="9:16">9:16 Mobile</option>
                    </select>
                  </div>
                </div>

                {/* Local Cache Management for Testing */}
                <div className="p-3 bg-[#16161e] border border-[#252533] rounded-lg flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-white">Local Device Cache</p>
                    <p className="text-[11px] text-[#787884]">
                      Wipe downloaded offline files for this game so your changes re-download fresh.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleClearSingleGameCache(editingGame.name)}
                    disabled={clearingGameCache}
                    className="px-3 py-1.5 rounded-lg bg-[#242432] hover:bg-[#2f2f42] text-xs font-medium text-white transition-colors cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {clearingGameCache ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>Clear Cache</span>
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#22222d]">
                  <button
                    type="button"
                    onClick={() => setEditingGame(null)}
                    className="px-4 py-2 bg-[#1b1b24] hover:bg-[#262633] text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEditGame}
                    className="px-4 py-2 bg-white hover:bg-[#e4e4e7] text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {savingEditGame ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                        <span>Saving Game...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmation Dialog (Modal-Safe, works in Sandboxed iFrames) */}
        {confirmDialog && (
          <div
            id="confirm-action-modal-overlay"
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !actionLoading && setConfirmDialog(null)}
          >
            <div
              id="confirm-action-modal"
              className="bg-[#14141c] border border-[#28283a] rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    confirmDialog.isDestructive
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-white/10 text-white border border-white/15'
                  }`}
                >
                  {confirmDialog.isDestructive ? (
                    <Trash2 className="w-4 h-4" />
                  ) : (
                    <AlertTriangle className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white tracking-tight">
                    {confirmDialog.title}
                  </h3>
                  <p className="text-xs text-[#8f8f9f] mt-1.5 leading-relaxed break-words">
                    {confirmDialog.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#222230]">
                <button
                  type="button"
                  id="confirm-action-cancel-btn"
                  disabled={actionLoading}
                  onClick={() => setConfirmDialog(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1e1e28] hover:bg-[#282836] text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {confirmDialog.cancelText || 'Cancel'}
                </button>
                <button
                  type="button"
                  id="confirm-action-confirm-btn"
                  disabled={actionLoading}
                  onClick={async () => {
                    try {
                      setActionLoading(true);
                      await confirmDialog.onConfirm();
                    } finally {
                      setActionLoading(false);
                      setConfirmDialog(null);
                    }
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 ${
                    confirmDialog.isDestructive
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-white hover:bg-[#e4e4e7] text-black font-semibold'
                  }`}
                >
                  {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{confirmDialog.confirmText || 'Confirm'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Community Auth / Profile Modal */}
        {showAuthModal && (
          <CommunityAuthModal
            currentUser={currentUser}
            isAdmin={isAdmin}
            onAdminStatusChange={(status) => setIsAdmin(status)}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </div>
    </div>
  );
};
