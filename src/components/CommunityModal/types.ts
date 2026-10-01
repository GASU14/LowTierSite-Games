export type CommunityTab = 'announcements' | 'general' | 'bugs' | 'suggestions' | 'members' | 'admin';

export type PostCategory = 'all' | 'chat' | 'announcement' | 'bug_report' | 'suggestion';

export interface CommunityPost {
  id: string;
  tab: string; // 'general', 'announcements', 'chat', etc.
  category?: 'chat' | 'announcement' | 'bug_report' | 'suggestion';
  content: string;
  imageUrl?: string;
  authorName: string;
  authorId: string;
  authorBadge?: string;
  authorRole?: 'admin' | 'member';
  isAnnouncement?: boolean;
  createdAt: number;
}

export interface CommunityUser {
  uid: string;
  username: string;
  email: string;
  role: 'admin' | 'member';
  badge?: string;
  isBanned?: boolean;
  createdAt: number;
}
