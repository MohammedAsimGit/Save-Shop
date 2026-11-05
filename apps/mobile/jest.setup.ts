// Keeps the test environment explicit: Sprint 0 tests cover the API client only,
// which has no native dependencies. Component tests will need additional mocks
// (react-navigation, safe-area-context) and are added with the first real screen.
process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
