/**
 * Types and interfaces for the Pikachu Duel Admin Console and Stage Controller.
 */

export interface AdminSettings {
  enabled: boolean;
  floatingBarVisible: boolean;
  defaultJumpStage: number;
}

export type AdminStageAction = 'play' | 'setProfile' | 'unlockAll' | 'submitScore' | 'reset';
