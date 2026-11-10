import { describe,it,expect } from 'vitest';
import { stageDatesValid,initialiseTerms,appointmentAccess } from './appointments';
describe('appointments',()=>{
it('keeps copied defaults unchanged when the client defaults change',()=>{const d={payment_terms:'30 days'};const a=initialiseTerms(d);d.payment_terms='60 days';expect(a.payment_terms).toBe('30 days');});
it('does not assume tender dates cover delivery',()=>{expect(stageDatesValid([{name:'Tender',scope:'Tender only',starts_on:'2026-11-10',ends_on:'2026-11-01'}])).toBe(false);});
it('allows separately dated tender and delivery stages',()=>{expect(stageDatesValid([{name:'Tender',scope:'Tender only',starts_on:'2026-11-10',ends_on:'2026-12-01'},{name:'Delivery',scope:'Delivery only',starts_on:'2027-01-01',ends_on:'2027-06-01'}])).toBe(true);});
it('requires project access even with a commercial grant',()=>expect(appointmentAccess(false,true,true)).toEqual({view:false,edit:false,commercialView:false,commercialEdit:false}));
it('keeps commercial details restricted for a project manager without a grant',()=>expect(appointmentAccess(true,true,false).commercialView).toBe(false));
});