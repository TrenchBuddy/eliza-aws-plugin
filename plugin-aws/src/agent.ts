import { Character, validateCharacterConfig } from "@ai16z/eliza";
import { getCharacterInfo } from "./utils/dynamoCharacterInfo";

// to add support for loading characters from a database, we need to add the import for generateCharactersFromDB
// to agent/index.ts and add the following code to the startAgents method in that file:
/*
    // existing code
    let charactersArg = args.characters || args.character;
    let characters = [defaultCharacter];

    // add the code below
    let getCharactersFromDB = args.get_characters_from_db;

    if  (getCharactersFromDB) {
        characters = await generateCharactersFromDB(charactersArg, __dirname);
    } else if (charactersArg) {
        characters = await loadCharacters(charactersArg);
    }

*/


export async function generateCharacterFromDB(username: string, __dirname: string) : Promise<Character[]> {
    const character = await getCharacterInfo(username, ''); // default is ElizaPreferences

    validateCharacterConfig(character);

    return [character];
}