import test from 'node:test';import assert from 'node:assert/strict';
import {prepareMigration,SOURCE_BASE} from '../src/migration.js';
test('migration keeps directory scope, historical fields, archived photos, transforms and color type',()=>{
 const plan=prepareMigration({baseId:SOURCE_BASE,exportedAt:'2026-10-27',tables:{
 CustomerDirectory:[{id:'rec1',fields:{CustomerId:'123',FirstName:'Sample',LastName:'Member',ColorType:'Soft Cool Light',MembershipStatus:'Inactive',PermissionToUse:true,JoinedDate:'2020-01-01'}}],
 CustomerPhotos:[{id:'photo1',fields:{CustomerId:'123',OriginalPhotoUrl:'https://example.com/original.png',AdjustedPhotoUrl:'https://example.com/adjusted.png',PhotoTransform:'{"x":5,"y":7,"scale":1.5}'}}],
 PersonalStudioPhotos:[{id:'photo2',fields:{CustomerId:'123',OriginalPhotoUrl:'https://example.com/old.png',IsArchived:true}},{id:'other',fields:{CustomerId:'999',PhotoUrl:'https://example.com/not-in-scope.png'}}],
 MemberDrapingHistory:[{id:'history1',fields:{CustomerId:'123',Notes:'Keep this history'}}]
 }});
 assert.equal(plan.tables.Customers.length,1);const row=plan.tables.Customers[0];assert.equal(row.paletteName,'Soft Cool Light');assert.equal(row.paletteCode,'SCL');assert.equal(row.sourceData.JoinedDate,'2020-01-01');assert.equal(row.membershipStatus,'Inactive');assert.equal(row.isClient,false);
 assert.equal(plan.tables.Photos.length,3);assert.ok(plan.tables.Photos.some(p=>p.archived));assert.equal(row.photoTransform.x,5);assert.ok(plan.tables.SourceArchive.some(r=>r.table==='MemberDrapingHistory'));assert.ok(!JSON.stringify(plan).includes('not-in-scope'));
});
test('migration fails closed for wrong source or duplicate identities',()=>{
 assert.throws(()=>prepareMigration({baseId:'wrong',tables:{}}));
 assert.throws(()=>prepareMigration({baseId:SOURCE_BASE,tables:{CustomerDirectory:[{id:'a',fields:{CustomerId:'1'}},{id:'b',fields:{CustomerId:'1'}}]}}),/duplicate/);
});
