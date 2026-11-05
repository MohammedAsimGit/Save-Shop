/** Root stack routes. Screens for later sprints are added here as they land. */
export type RootStackParamList = {
  Home: undefined;
  Diagnostics: undefined;
};

declare global {
  // Module declaration merging is the documented React Navigation pattern.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    // Makes useNavigation() typed without importing the param list everywhere.
    // Declaration merging requires an interface, so the empty-body rule has to
    // be waived here; there is no non-empty member to add.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
