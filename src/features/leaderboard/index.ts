export { AuthModal } from './components/AuthModal';
export { LeaderboardModal } from './components/LeaderboardModal';
export { useAuth } from './hooks/useAuth';
export { useAccountProgress, type ProgressSyncStatus } from './hooks/useAccountProgress';
export {
  fetchLeaderboard,
  submitScore,
  login,
  register,
  fetchMe,
  getStoredToken,
  getStoredUser,
  setStoredAuth,
  clearStoredAuth,
  fetchAccountProgress,
  putAccountProgress,
  type User,
  type UserStats,
  type LeaderboardEntry,
  type LeaderboardResponse,
  type ScoreSubmission,
} from './leaderboardApi';
export { AVATARS, avatarSrc } from './avatars';
