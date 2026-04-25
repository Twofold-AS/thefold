"use client";

// Root-path (/) = Incognito-fanen. Deler chat-infrastrukturen med CoWork/Designer,
// men sidebaren er tom (privat-modus) og `projectScope` settes til "incognito"
// via pathname-detection i cowork/page.tsx.
// TODO: wire up privat-samtale-innhold (ingen backend-logging) when decided.
export { default } from "./cowork/page";
