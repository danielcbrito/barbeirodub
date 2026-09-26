import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.80.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarEvent {
  action: 'create' | 'update' | 'delete';
  eventId?: string;
  appointmentId: string;
  summary: string;
  description: string;
  startDateTime: string;
  endDateTime: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get Google Calendar API credentials from Supabase secrets
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const googleRefreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

    if (!googleClientId || !googleClientSecret || !googleRefreshToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: 'Google Calendar não configurado. Configure as credenciais no painel admin.' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const event: CalendarEvent = await req.json();

    // Get access token using refresh token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        refresh_token: googleRefreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const { access_token } = await tokenResponse.json();

    if (!access_token) {
      throw new Error('Failed to get access token');
    }

    let result;

    if (event.action === 'create') {
      // Create event in Google Calendar
      const calendarEvent = {
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.startDateTime,
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: event.endDateTime,
          timeZone: 'America/Sao_Paulo',
        },
        colorId: '11', // Red color for barbershop appointments
      };

      const response = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calendarEvent),
        }
      );

      result = await response.json();

      // Store the Google Calendar event ID in Supabase
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase
        .from('agendamentos')
        .update({ observacoes: `Google Calendar ID: ${result.id}` })
        .eq('id', event.appointmentId);

    } else if (event.action === 'delete' && event.eventId) {
      // Delete event from Google Calendar
      await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.eventId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        }
      );

      result = { deleted: true };
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Google Calendar sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: 'Erro ao sincronizar com Google Calendar',
        error: errorMessage 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
