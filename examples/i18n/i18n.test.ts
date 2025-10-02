import {describe, it, expect} from 'vitest';
import {LayeredConfig} from '../../src';

type Localization = {
   __name: string
   __inherits?: string,

    //simplest case:
    "ok":string,

    //double dot - for escaping the dot symbol
    //its present in the source, and we don't alter the original labels
   "welcome..message": string
   "search..query..placeholder": string
}

//country => language => labels
//getting `welcome.message` label for us/en:
//labels["en"]["us"]["welcome.message"]

const fs = await import('fs');
const url = await import('url');
const path = await import('path');

//Typically we get labels from somewhere
//const labels = await (await fetch(`https://website.com/labels`)).json();

//get file location relative to this md file
const currentPath = path.dirname(url.fileURLToPath(import.meta.url));
//and load the json file
const labelSource = JSON.parse(
    fs.readFileSync(
        path.join(currentPath,'labels.json')
    ).toString()
) as Record<string,Record<string, Localization>>;

//This function must acknowledge the inheritance order, and starting with the "leaf",
//the target language, it goes up the tree, loading less meaningful sources of labels, so we follow the chain:

// it/it => en/us
// en/uk => en/us
// ca/fr => ca/en => us/en
// ch/de => de/de => us/en
// and so on for other languages
function getLabelsFor(country: string, language: string) {
   const labelLayers = [labelSource[language][country]] //initialize the first layer
   //iterate over the locale-inheritance
    while (labelLayers[labelLayers.length - 1].__inherits) {
      const [ll, cc] = labelLayers[labelLayers.length - 1].__inherits!.split(" ");
      labelLayers.push(labelSource[ll][cc])
   }
   //now we reverse the array and map to our layers
   return LayeredConfig.fromLayers(labelLayers.reverse().map(layer=>{
       return {name: layer.__name, config: layer}
   }));
}

describe('i18n use case', ()=>{
    it('handles simple use case us en',()=>{
        const text=getLabelsFor('us','en'); //simple case, main language
        expect(text('ok',"ok...")).toBe("Ok!");
        expect(text('welcome..message',"hello")).toBe("Welcome!");
        //@ts-ignore
        expect(text('label.not.defined',"huh?")).toBe("huh?");
    })
    it('handles locale inheritance',()=>{
        const gb = getLabelsFor('gb','en');
        expect(gb('ok')).toBe('Ok!');
        expect(gb('welcome..message')).toBe('Welcome!');
        expect(gb('search..query..placeholder')).toBe('Type your search phrase...');
        const fr = getLabelsFor('fr','fr');
        expect(fr('ok')).toBe('Ok!');
        expect(fr('welcome..message')).toBe('Bienvenue!');
        expect(fr('search..query..placeholder')).toBe('Tapez votre recherche...');
        const cafr = getLabelsFor('ca','fr');
        expect(cafr('ok')).toBe('Ok!');
        expect(cafr('welcome..message')).toBe('Salut!');
        expect(cafr('search..query..placeholder')).toBe('Entrez votre recherche ici...');
    });
});
