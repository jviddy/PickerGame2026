resend key: re_Cz4jSkHj_5ZjBPFi5tYsWaS7vmfREX4Ld


I'm using the Resend API. Help me add this code to my project.

Ask the user to replace `re_xxxxxxxxx` with their real API key.

```javascript
import { Resend } from 'resend';

const resend = new Resend('re_xxxxxxxxx');

resend.emails.send({
  from: 'onboarding@resend.dev',
  to: 'jamie@vidamour.com',
  subject: 'Hello World',
  html: '<p>Congrats on sending your <strong>first email</strong>!</p>'
});
```

Type	Name	Content	TTL	Priority
TXT	
resend._domainkey
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC6YLKRV9uJ1qgeVQmvXmY5e/jnJZfGmgujYfE2+PkaSMepMPx7pjv8vyXKNAE+e9/mh/1bPgHvyTfub+E/d3t9KMjEkHEmLNGn0RvJANGFA39ruUTMKGpFMbJkrjitBkv/trvaXRBJRlJ9XDx1E5hdAGe1ytQokWI7+OPlwfXN1wIDAQAB
Auto


feedback-smtp.eu-west-1.amazonses.com

onboarding key
re_7an6eoBj_LQAFpcsNbAgFzCracWG3vx4k


- on sign up Email addresses do not need to be unique. the combination of your name and email address needs to be unique.
- Team names need to be unique
- on the match admin page it doesn’t need a qualify for next round option for group games. Take this away. Add a section after the last of the group stage 3 games with a list if the countries by group, and a tick box for if they have qualified and a submit button for the whole section.  I’ll go through these after the last group game and update status. This should award qualify for knockdown its points and set the still in tournament status. 
- on the leader board on mobile  the county option doesn’t show the individual country score. I think they are too big. Scale them to fit. The default option on mobile should be a clean leaderboard with team name, entrant name and score. When country or round is selected the entrant name should be hidden

