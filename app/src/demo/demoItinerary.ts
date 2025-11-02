import type { Itinerary } from '../App';

export const demoItinerary: Itinerary = {
  id: 'demo-itinerary',
  createdAt: '2025-10-01T09:00:00.000Z',
  destination: 'Jaipur, India',
  budget: 45000,
  totalEstimatedCost: 38900,
  currency: 'INR',
  weatherAdvisory: 'Mild afternoons, breezy evenings. Carry a light layer.',
  costBreakdown: [
    { category: 'Stay', amount: 16000, notes: 'Heritage haveli (2 nights)' },
    { category: 'Experiences', amount: 12000 },
    { category: 'Local Transport', amount: 5000 },
    { category: 'Food', amount: 5900 },
  ],
  days: [
    {
      dateLabel: 'Day 1 - Amber & Old City',
      summary: 'Amber Fort, stepwells, and a sunset over Nahargarh with local snacks.',
      activities: [
        {
          time: '09:00',
          title: 'Amber Fort guided walk',
          description: 'Explore courtyards and mirrorwork; start early to beat queues.',
          cost: 1200,
          location: 'Amber Fort, Jaipur',
          source: 'mock',
        },
        {
          time: '13:00',
          title: 'Panna Meena Ka Kund',
          description: 'Iconic stepwell photo stop and short stroll nearby.',
          cost: 0,
          location: 'Panna Meena Ka Kund, Jaipur',
          source: 'mock',
        },
        {
          time: '17:00',
          title: 'Nahargarh Sunset Point',
          description: 'City vistas at golden hour; tea and kachori at the viewpoint.',
          cost: 300,
          location: 'Nahargarh Fort, Jaipur',
          source: 'mock',
        },
      ],
      accommodation: {
        name: 'Shahpura House (Heritage)',
        cost: 8000,
        notes: 'Breakfast included; central location.',
      },
    },
    {
      dateLabel: 'Day 2 - City Palace & Bazaars',
      summary: 'City Palace, Hawa Mahal facade, and a food crawl through Johari & Bapu Bazaar.',
      activities: [
        {
          time: '10:00',
          title: 'City Palace & Museum',
          description: 'Royal textiles and arms; optional royal courtyard ticket.',
          cost: 1500,
          location: 'City Palace, Jaipur',
          source: 'mock',
        },
        {
          time: '13:30',
          title: 'Hawa Mahal photo stop',
          description: 'Facade from across the street cafe balconies; quick refreshment.',
          cost: 200,
          location: 'Hawa Mahal Road, Jaipur',
          source: 'mock',
        },
        {
          time: '16:30',
          title: 'Bazaar food trail',
          description: 'Lassi, kachori, and kulfi as you browse handicrafts.',
          cost: 700,
          location: 'Johari & Bapu Bazaar, Jaipur',
          source: 'mock',
        },
      ],
    },
    {
      dateLabel: 'Day 3 - Pink Walls & Hand-block Prints',
      summary: 'Morning stroll along the pink facades, hand-block printing workshop, and cafe lunch.',
      activities: [
        {
          time: '08:30',
          title: 'Pink City morning walk',
          description: 'Quiet streets and pastel gates before traffic picks up.',
          cost: 0,
          location: 'Ajmeri Gate to Chandpol Gate, Jaipur',
          source: 'mock',
        },
        {
          time: '11:00',
          title: 'Block-printing workshop',
          description: 'Learn traditional techniques; take home your printed tote.',
          cost: 1800,
          location: 'Anokhi Workshop, Jaipur',
          source: 'mock',
        },
        {
          time: '14:00',
          title: 'Cafe lunch & wrap-up',
          description: 'Local thali or light bites before departure.',
          cost: 600,
          location: 'C-Scheme, Jaipur',
          source: 'mock',
        },
      ],
    },
  ],
  meta: { source: 'mock' },
};

