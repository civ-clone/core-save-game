import { ClientDescriptor, SaveGame } from './SaveGame';
import { Game } from '@civ-clone/core-game/Game';
/** What the host says of a client, for the file: whether a person plays it, the class serving it, and the person's name. */
export type DescribedClient = Omit<ClientDescriptor, 'playerId'>;
export type SaveOptions = {
  name?: string;
  build?: string;
  createdAt?: number;
  describeClient?: (client: unknown) => DescribedClient;
};
export declare const save: (game: Game, options?: SaveOptions) => SaveGame;
export default save;
