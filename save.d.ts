import { SaveGame } from './SaveGame';
import { Game } from '@civ-clone/core-game/Game';
export type SaveOptions = {
  name?: string;
  build?: string;
  createdAt?: number;
};
export declare const save: (game: Game, options?: SaveOptions) => SaveGame;
export default save;
