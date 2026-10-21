// Test passages. A and B are the same content in every language.
// M is an optional mixed-language line (second language: English).
// Filenames made by collect.html carry the language and passage id, so compare.html
// can look the reference text up from the name with referenceFromName().

export const PASSAGES = {
  en: {
    A: "Hi, it's me. I'm at the station and the train is twenty minutes late. Can you tell Maria that I'll be there around half past six? We can have dinner afterwards.",
    B: "The meeting is on the fourteenth of March, at quarter to ten, in room two hundred and four. Please bring the report and the invoice for two thousand five hundred euros.",
  },
  nl: {
    A: "Hoi, ik ben het. Ik sta op het station en de trein heeft twintig minuten vertraging. Kun je Maria zeggen dat ik rond half zeven ben? Daarna kunnen we samen eten.",
    B: "De vergadering is op veertien maart, om kwart voor tien, in lokaal tweehonderdvier. Neem het rapport mee en de factuur van tweeduizend vijfhonderd euro.",
    M: "Hello, my name is Sam, en ik woon in Antwerpen. Can you send me the address, alsjeblieft?",
  },
  fr: {
    A: "Salut, c'est moi. Je suis à la gare et le train a vingt minutes de retard. Peux-tu dire à Maria que j'arriverai vers dix-huit heures trente ? On pourra dîner ensemble après.",
    B: "La réunion a lieu le quatorze mars, à dix heures moins le quart, dans la salle deux cent quatre. Apporte le rapport et la facture de deux mille cinq cents euros.",
    M: "Hello, my name is Sam, et j'habite à Bruxelles. Can you send me the address, s'il te plaît ?",
  },
  pl: {
    A: "Cześć, to ja. Jestem na dworcu, a pociąg ma dwadzieścia minut opóźnienia. Powiedz Marii, że będę około wpół do siódmej. Potem możemy razem zjeść kolację.",
    B: "Spotkanie odbędzie się czternastego marca, za kwadrans dziesiąta, w sali dwieście cztery. Przynieś raport i fakturę na dwa tysiące pięćset euro.",
    M: "Hello, my name is Sam, a mieszkam w Krakowie. Can you send me the address, proszę?",
  },
  es: {
    A: "Hola, soy yo. Estoy en la estación y el tren lleva veinte minutos de retraso. ¿Puedes decirle a María que llegaré sobre las seis y media? Luego podemos cenar juntos.",
    B: "La reunión es el catorce de marzo, a las diez menos cuarto, en la sala doscientos cuatro. Trae el informe y la factura de dos mil quinientos euros.",
    M: "Mañana tengo la reunión with the client a las diez, so I need to leave pronto. Can you send me la dirección, por favor?",
  },
};

export const LANG_NAMES = { en: "English", nl: "Nederlands", fr: "Français", pl: "Polski", es: "Español" };

// "Sam_nl_quiet_A_20261021T1330.wav" -> the Dutch passage A, or "" if the name doesn't match.
export function referenceFromName(name) {
  const m = /_(en|nl|fr|pl|es)_(?:quiet|street|any)_([ABM])_/.exec(name);
  return (m && PASSAGES[m[1]]?.[m[2]]) || "";
}
