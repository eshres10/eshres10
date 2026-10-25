import type { Course } from './types';

export const neuroscience: Course = {
  id: 'neuroscience',
  title: 'Neuroscience',
  units: [
    { id: 'neurons', title: 'Meet your neurons', lessonCount: 6 },
    { id: 'signals', title: 'How neurons talk', lessonCount: 7 },
    { id: 'memory', title: 'Memory', lessonCount: 12 },
    { id: 'sleep', title: 'Sleep and the brain', lessonCount: 10 },
    { id: 'emotion', title: 'Emotion', lessonCount: 10 },
  ],
  lessons: [
    {
      day: 14,
      unitId: 'memory',
      title: 'Why you lose your keys',
      minutes: 6,
      heroIllustration: 'keys-thought',
      mission: 'say "keys on the bench" out loud when you put them down.',
      tomorrow: {
        title: 'The man who could never make a new memory',
        teaser: 'In 1953, one surgery changed how we understand memory forever.',
      },
      deeper: {
        title: 'The proper terms',
        intro: 'The same idea, the way a first-year medical student learns it.',
        terms: [
          {
            term: 'Declarative memory',
            definition: 'Memory for facts and events. Forming new ones depends on the hippocampus.',
          },
          {
            term: 'Encoding failure',
            definition:
              'Without attention, partly directed by the prefrontal cortex, information is never encoded.',
          },
          {
            term: 'Consolidation',
            definition:
              'Memories are gradually stabilised in the neocortex, a process strongly linked to sleep.',
          },
        ],
      },
      cards: [
        {
          id: 'd14-review-synapse',
          type: 'review',
          fromDay: 3,
          kind: 'type',
          prompt: 'Neurons pass messages across a tiny gap. What is that gap called?',
          answers: ['synapse', 'synaptic'],
          explanation: 'The synapse. Chemical messengers called neurotransmitters cross it.',
        },
        {
          id: 'd14-review-firing',
          type: 'review',
          fromDay: 9,
          kind: 'choice',
          prompt: 'Which happens first when a neuron fires?',
          options: [
            'Neurotransmitters are released',
            'An electrical signal travels down the axon',
            'The next neuron receives the message',
          ],
          correct: 1,
          explanation:
            'Electrical signal down the axon, then chemicals released, then the next neuron receives it.',
        },
        {
          id: 'd14-mystery-keys',
          type: 'mystery',
          prompt: "You put your keys down five minutes ago. Now they're gone. What failed?",
          options: [
            'The memory faded quickly',
            'The memory was never made',
            'Your brain deleted it to save space',
          ],
          correct: 1,
          commonGuess: 0,
          explanation:
            'Usually nothing was forgotten. You were thinking about something else, so your brain never took the photo.',
        },
        {
          id: 'd14-story-camera',
          type: 'story',
          title: 'Memory works like a camera',
          body: "Making a memory takes three steps. If the photo was never taken, there's nothing to find later.",
          illustration: 'camera',
          illustrationBg: 'coral',
          deeper: true,
          chips: [
            { label: 'Encode', sub: 'take the photo', tone: 'butter' },
            { label: 'Store', sub: 'keep it safe', tone: 'mint' },
            { label: 'Retrieve', sub: 'find it again', tone: 'lavender' },
          ],
        },
        {
          id: 'd14-story-shutter',
          type: 'story',
          title: 'Attention is the shutter button',
          body: 'When you dropped your keys, your hands were on autopilot and your mind was on your phone. No attention, no click, no photo.',
          illustration: 'shutter',
          illustrationBg: 'butter',
          deeper: true,
        },
        {
          id: 'd14-story-hippocampus',
          type: 'story',
          title: 'Meet the hippocampus',
          body: 'Deep in each side of your brain sits a curled structure shaped a bit like a seahorse. It works like a librarian, filing new experiences as lasting memories.',
          illustration: 'hippocampus',
          illustrationBg: 'lavender',
          deeper: true,
        },
        {
          id: 'd14-recall-store',
          type: 'recall',
          kind: 'type',
          prompt: 'Memory has three steps: encode, ____, retrieve.',
          answers: ['store', 'storage', 'storing'],
          explanation: 'Store. Encode, store, retrieve.',
        },
        {
          id: 'd14-recall-sam',
          type: 'recall',
          kind: 'choice',
          prompt:
            'Sam reads a whole page while thinking about dinner and remembers none of it. Which step failed?',
          options: ['Encode', 'Store', 'Retrieve'],
          correct: 0,
          explanation:
            'Encode. Sam’s eyes moved over the words, but attention was elsewhere, so no photo was taken.',
        },
        {
          id: 'd14-explain-keys',
          type: 'explain',
          friendSays: "I'm so forgetful. I lose my keys every single day. What's really going on?",
          modelAnswer:
            "You're probably not forgetting. You put them down while thinking about something else, so your brain never saved the memory to begin with.",
          rubric: [
            {
              keywords: [
                'attention',
                'paying attention',
                'distracted',
                'something else',
                'autopilot',
                'not focus',
                'focus',
                'thinking about',
              ],
              praise: 'Attention is the key ingredient. Nice.',
              hint: "Mention attention: their mind was on something else when they put the keys down.",
            },
            {
              keywords: [
                'never made',
                'never saved',
                'never stored',
                'never encoded',
                'never formed',
                'never took',
                'never recorded',
                'not saved',
                "wasn't saved",
                "didn't save",
                'not encoded',
                'encod',
                'nothing to remember',
                'nothing to find',
                'no memory',
              ],
              praise: 'You explained that the memory was never made.',
              hint: "Say what that means: the memory was never made, so there's nothing to remember.",
            },
          ],
        },
        {
          id: 'd14-mission',
          type: 'mission',
          title: 'Your mission',
          body: 'Next time you put your keys down, look at them and say it out loud: "Keys on the bench." That one second of attention is the shutter click.',
        },
      ],
    },
  ],
};

export const currentDay = 14;
export const reviewPreview = { count: 2, topics: 'Synapses, how neurons fire', minutes: 1 };
