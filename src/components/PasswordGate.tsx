import React, { useState } from 'react';
import { Eye, EyeOff, ArrowRight } from 'lucide-react';

interface PasswordGateProps {
  onUnlock: () => void;
}

const AUTH_HASH = '83fde3b722e0824d7959a188358167420ccdfdc6a4cbf3b06cfbdc73323f1ea9';
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

async function sha256(message: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('Web Crypto SHA-256 failed, falling back to JS implementation', e);
    }
  }

  // Pure JavaScript standard SHA-256 implementation
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i = 0, j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = message[lengthProperty] * 8;

  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;

  const isComposite: Record<number, number> = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  words[asciiBitLength >> 5] |= 0x80 << (24 - (asciiBitLength % 32));
  words[(((asciiBitLength + 64) >> 9) << 4) + 15] = asciiBitLength;

  for (i = 0; i < message[lengthProperty]; i++) {
    j = message.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }

  for (j = 0; j < words[lengthProperty]; j += 16) {
    const w = words.slice(j, j + 16);
    const oldHash = hash.slice(0, 8);
    let currHash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15];
      const w2 = w[i - 2];

      const a = currHash[0];
      const e = currHash[4];
      const temp1 =
        currHash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & currHash[5]) ^ (~e & currHash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i] || 0
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                (w[i - 7] || 0) +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & currHash[1]) ^ (a & currHash[2]) ^ (currHash[1] & currHash[2]));

      currHash = [(temp1 + temp2) | 0, ...currHash.slice(0, 7)];
      currHash[4] = (currHash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (currHash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (8 * j)) & 255;
      result += (b < 16 ? '0' : '') + b.toString(16);
    }
  }

  return result;
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanPassword = password.trim();
    if (!cleanPassword || isVerifying) return;

    setIsVerifying(true);
    setError(false);

    try {
      const hashExact = await sha256(cleanPassword);
      const hashLower = await sha256(cleanPassword.toLowerCase());

      if (hashExact === AUTH_HASH || hashLower === AUTH_HASH) {
        try {
          localStorage.setItem('lts_auth_exp', (Date.now() + THIRTY_DAYS_MS).toString());
        } catch (e) {
          // ignore storage access errors
        }
        try {
          sessionStorage.setItem('lts_auth', 'true');
        } catch (e) {}
        onUnlock();
      } else {
        setError(true);
        setPassword('');
      }
    } catch (err) {
      setError(true);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      id="password-gate-screen"
      className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 selection:bg-white selection:text-black select-none"
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Site Title */}
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-6">
          LowTierSite
        </h1>

        {/* Password Entry Form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center gap-2">
          <div className="w-full relative flex items-center">
            <input
              id="site-password-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Enter password..."
              autoFocus
              disabled={isVerifying}
              autoComplete="current-password"
              className={`w-full bg-[#111111] border ${
                error ? 'border-red-500 focus:border-red-500' : 'border-[#262626] focus:border-white'
              } text-white pl-4 pr-20 py-2.5 rounded-lg text-sm text-center outline-none transition-colors placeholder-[#555555] disabled:opacity-50`}
            />

            <div className="absolute right-2 flex items-center gap-1 text-[#888888]">
              <button
                type="button"
                id="toggle-password-visibility-btn"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 hover:text-white transition-colors focus:outline-none"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>

              <button
                type="submit"
                id="submit-password-btn"
                disabled={!password.trim() || isVerifying}
                className="p-1.5 hover:text-white disabled:opacity-30 disabled:hover:text-[#888888] transition-colors focus:outline-none"
                title="Submit password"
              >
                <ArrowRight size={16} />
              </button>
            </div>
          </div>

          {error && (
            <p id="password-error-msg" className="text-xs text-red-500 font-medium">
              Incorrect password
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
