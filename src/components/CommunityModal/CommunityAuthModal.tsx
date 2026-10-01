import React, { useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import {
  X,
  User as UserIcon,
  Mail,
  Lock,
  LogOut,
  CheckCircle,
  AlertCircle,
  Shield,
  Key,
  Crown
} from 'lucide-react';

interface CommunityAuthModalProps {
  currentUser: User | null;
  isAdmin: boolean;
  onAdminStatusChange?: (isAdmin: boolean) => void;
  onClose: () => void;
}

export const CommunityAuthModal: React.FC<CommunityAuthModalProps> = ({
  currentUser,
  isAdmin,
  onAdminStatusChange,
  onClose,
}) => {
  const [isRegister, setIsRegister] = useState(!currentUser);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Admin role claim state
  const [showClaimAdmin, setShowClaimAdmin] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [adminClaimLoading, setAdminClaimLoading] = useState(false);

  // If user is jayden.gass10@gmail.com, auto-promote if not already
  useEffect(() => {
    if (currentUser?.email?.toLowerCase() === 'jayden.gass10@gmail.com' && !isAdmin) {
      handleDirectAdminGrant();
    }
  }, [currentUser, isAdmin]);

  const handleDirectAdminGrant = async () => {
    if (!currentUser) return;
    try {
      await setDoc(doc(db, 'admins', currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email,
        grantedAt: Date.now(),
      }, { merge: true });
      await setDoc(doc(db, 'users', currentUser.uid), {
        role: 'admin',
        badge: 'ADMIN',
      }, { merge: true });
      onAdminStatusChange?.(true);
      setSuccess('Admin role activated for your account!');
    } catch (err: any) {
      console.warn('Could not auto-promote admin:', err);
    }
  };

  const handleClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setError('You must be signed in to claim the Admin role.');
      return;
    }

    setAdminClaimLoading(true);
    setError(null);
    setSuccess(null);

    const secret = adminSecret.trim().toLowerCase();
    const isOwnerEmail = currentUser.email?.toLowerCase() === 'jayden.gass10@gmail.com';
    const isValidKey = secret === 'admin' || secret === 'lowtier-admin' || secret === 'admin123' || isOwnerEmail;

    if (!isValidKey && !isOwnerEmail) {
      setError('Invalid Admin Key. Please enter the correct authorization key.');
      setAdminClaimLoading(false);
      return;
    }

    try {
      // Store in admins collection
      await setDoc(doc(db, 'admins', currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email || 'admin',
        grantedAt: Date.now(),
      }, { merge: true });

      // Update user doc role
      await setDoc(doc(db, 'users', currentUser.uid), {
        role: 'admin',
        badge: 'ADMIN',
        username: currentUser.displayName || currentUser.email?.split('@')[0] || 'Admin',
      }, { merge: true });

      onAdminStatusChange?.(true);
      setSuccess('Admin role successfully activated on your account!');
      setShowClaimAdmin(false);
      setAdminSecret('');
    } catch (err: any) {
      setError('Failed to grant admin role: ' + err.message);
    } finally {
      setAdminClaimLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!username.trim()) {
          throw new Error('Please enter a username');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(cred.user, { displayName: username.trim() });

        const isOwner = email.trim().toLowerCase() === 'jayden.gass10@gmail.com';

        // Save user record to Firestore
        try {
          await setDoc(
            doc(db, 'users', cred.user.uid),
            {
              uid: cred.user.uid,
              username: username.trim(),
              email: email.trim(),
              role: isOwner ? 'admin' : 'member',
              badge: isOwner ? 'ADMIN' : 'MEMBER',
              isBanned: false,
              createdAt: Date.now(),
            },
            { merge: true }
          );

          if (isOwner) {
            await setDoc(
              doc(db, 'admins', cred.user.uid),
              {
                uid: cred.user.uid,
                email: email.trim(),
                grantedAt: Date.now(),
              },
              { merge: true }
            );
            onAdminStatusChange?.(true);
          }
        } catch (dbErr) {
          console.warn('Could not write user profile to firestore:', dbErr);
        }

        setSuccess(isOwner ? 'Account created with Admin privileges!' : 'Account created successfully');
        setTimeout(() => onClose(), 800);
      } else {
        const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
        if (cred.user.email?.toLowerCase() === 'jayden.gass10@gmail.com') {
          handleDirectAdminGrant();
        }
        setSuccess('Logged in successfully');
        setTimeout(() => onClose(), 600);
      }
    } catch (err: any) {
      let msg = err.message || 'Authentication failed';
      if (err.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Try logging in.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        msg = 'Incorrect email or password.';
      } else if (err.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      onAdminStatusChange?.(false);
      onClose();
    } catch (err: any) {
      setError('Failed to sign out: ' + err.message);
    }
  };

  return (
    <div
      id="community-auth-modal-overlay"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs select-none"
    >
      <div
        id="community-auth-modal-window"
        className="w-full max-w-sm bg-[#0e0e10] text-[#e0e0e0] border border-[#222225] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="bg-[#141416] px-4 py-3 flex items-center justify-between border-b border-[#1f1f23]">
          <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            {currentUser ? (
              <>
                <UserIcon className="w-4 h-4 text-white" />
                <span>Community Profile</span>
              </>
            ) : isRegister ? (
              'Join Community'
            ) : (
              'Community Sign In'
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-[#777777] hover:text-white p-1 rounded hover:bg-[#1e1e22] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {error && (
            <div className="mb-3 p-2.5 bg-[#2a1416] border border-[#441f23] rounded-md text-[#ff8080] text-xs flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-3 p-2.5 bg-[#14261a] border border-[#1f422b] rounded-md text-[#66e088] text-xs flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {currentUser ? (
            <div className="flex flex-col gap-4">
              {/* User Profile Info */}
              <div className="flex items-center gap-3 p-3 bg-[#131316] rounded-lg border border-[#202024]">
                <div className="w-10 h-10 rounded-full bg-[#202025] border border-[#2e2e34] flex items-center justify-center text-white font-bold text-sm">
                  {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-sm truncate">
                      {currentUser.displayName || 'Member'}
                    </span>
                    {isAdmin ? (
                      <span className="bg-[#20202a] border border-[#2e2e3c] text-[#d0d0d8] text-[9px] font-medium px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    ) : (
                      <span className="bg-[#1e1e24] border border-[#2d2d35] text-[#b0b0b8] text-[9px] font-medium px-1.5 py-0.2 rounded">
                        Member
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#777777] truncate">{currentUser.email}</p>
                </div>
              </div>

              {/* Admin Role Claiming Section */}
              {!isAdmin ? (
                <div className="p-3 bg-[#141419] rounded-lg border border-[#22222a] text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-medium text-white">
                      <Shield className="w-3.5 h-3.5 text-[#8e8e98]" />
                      <span>Admin Privileges</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowClaimAdmin(!showClaimAdmin)}
                      className="text-[#cccccc] hover:text-white text-xs font-medium cursor-pointer underline"
                    >
                      {showClaimAdmin ? 'Cancel' : 'Activate Admin'}
                    </button>
                  </div>
                  <p className="text-[11px] text-[#88888e] mt-1">
                    Admins can delete chats, ban members, and add new games to Firebase.
                  </p>

                  {showClaimAdmin && (
                    <form onSubmit={handleClaimAdmin} className="mt-3 flex flex-col gap-2">
                      <div className="relative">
                        <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#666666]" />
                        <input
                          type="password"
                          value={adminSecret}
                          onChange={(e) => setAdminSecret(e.target.value)}
                          placeholder="Enter Admin Key (e.g. admin)"
                          className="w-full bg-[#0d0d10] border border-[#2a2a35] text-white text-xs pl-8 pr-2.5 py-1.5 rounded focus:outline-none focus:border-[#4b4b5a]"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={adminClaimLoading}
                        className="w-full bg-white hover:bg-[#e4e4e7] text-black py-1.5 rounded text-xs font-medium transition-colors cursor-pointer"
                      >
                        {adminClaimLoading ? 'Verifying...' : 'Confirm Admin Role'}
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <div className="p-2.5 bg-[#141419] border border-[#22222a] rounded-lg text-xs flex items-center gap-2 text-[#b0b0b8]">
                  <Shield className="w-4 h-4 shrink-0 text-[#8e8e98]" />
                  <span>You have full Admin control over games, chats, and members.</span>
                </div>
              )}

              {/* Sign Out Button */}
              <button
                onClick={handleSignOut}
                className="w-full mt-1 bg-[#1a1a1e] hover:bg-[#25252a] text-[#ff6b6b] border border-[#2d2d35] py-2 px-4 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {isRegister && (
                <div>
                  <label className="block text-[11px] font-medium text-[#888888] mb-1">Username</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Your handle..."
                      className="w-full bg-[#131316] border border-[#222226] text-white text-xs pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-white transition-colors"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-[#888888] mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-[#131316] border border-[#222226] text-white text-xs pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-white transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#888888] mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#555555]" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full bg-[#131316] border border-[#222226] text-white text-xs pl-9 pr-3 py-2 rounded-lg focus:outline-none focus:border-white transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-white hover:bg-[#e0e0e0] text-black font-semibold py-2 px-4 rounded-lg text-xs transition-colors flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                {loading ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}
              </button>

              <div className="mt-3 pt-3 border-t border-[#1c1c20] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegister(!isRegister);
                    setError(null);
                  }}
                  className="text-xs text-[#888888] hover:text-white transition-colors cursor-pointer"
                >
                  {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
