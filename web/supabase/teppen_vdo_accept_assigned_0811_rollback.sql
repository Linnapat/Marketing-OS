-- Undo teppen_vdo_accept_assigned_0811.sql (only rows nobody has moved on since)

begin;

update graphic_requests g
   set stage = 'New Request',
       data = (g.data - 'acceptedBy' - 'acceptedAt' - 'acceptFixedBy')
              || jsonb_build_object('stage', 'New Request',
                                    'history', (g.data->'history') - (jsonb_array_length(g.data->'history') - 1))
 where g.data->>'acceptFixedBy' = 'teppen_vdo_accept_assigned_0811'
   and g.data->>'stage' = 'In Progress';

commit;
