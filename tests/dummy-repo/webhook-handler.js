export function processGithubWebhook(payload) {
  console.log('Received webhook payload...');

  // ❌ BUG: payload.commits is undefined for pull_request events!
  // This line throws: TypeError: Cannot read properties of undefined (reading 'map')
  const commitMessages = payload.commits.map(commit => commit.message);

  console.log(`Processing ${commitMessages.length} commits.`);
  return commitMessages;
}
