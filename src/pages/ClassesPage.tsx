import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Inbox } from 'lucide-react';
import type { ClassGroup, ClassStudent } from '../lib/classTypes';
import {
  assignmentsForClass, createClass, deleteClass, duplicateNames, getClasses, parseStudentList, saveClass, seedExampleClass,
} from '../lib/classes';
import { onStorageChange } from '../lib/storage';
import { ConfirmModal, EmptyState, Field, Modal, useToast } from '../components/ui';
import { formatDateShort } from '../lib/utils';
import { useNewParam } from '../lib/useNewParam';
import { AddIcon, AssignIcon, DeleteIcon, PrivacyIcon, StudentIcon, WarningIcon } from '../components/icons';
import { duplicateStudentNames, pastedDuplicatesMessage } from './klasWeergave';

/**
 * /klassen — het overzicht van de leerkracht.
 *
 * Een klas is bewust licht: een naam, een schooljaar en een lijst leerlingen.
 * Daarmee krijgt elk stuk werk een vaste identiteit (studentId), zodat het
 * klasoverzicht kan optellen — ook per leerplandoel.
 */
export function ClassesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [newOpen, setNewOpen] = useState(false);
  useNewParam(() => setNewOpen(true));
  const [deleteTarget, setDeleteTarget] = useState<ClassGroup | null>(null);

  useEffect(() => {
    seedExampleClass();
    return onStorageChange(() => setTick((t) => t + 1));
  }, []);

  // De open modals staan bewust in de lijst: na aanmaken of verwijderen moet
  // het overzicht opnieuw uit de opslag lezen. Het zijn herlees-triggers, geen
  // echte afhankelijkheden.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const classes = useMemo(() => getClasses(), [tick, newOpen, deleteTarget]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AssignIcon size={24} /> Klassen</h1>
          <p className="sub">
            Eén klaslink voor je leerlingen, één overzicht voor jou — ook als ze thuis op hun eigen
            toestel werken.
          </p>
        </div>
        <div className="page-head-actions">
          <Link to="/inleverpunt" className="btn btn-ghost"><Inbox size={18} /> Inleverpunt</Link>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}><AddIcon size={18} /> Nieuwe klas</button>
        </div>
      </div>

      {classes.length === 0 ? (
        <EmptyState icon={<AssignIcon size={40} />} title="Nog geen klassen">
          <p>
            Maak een klas aan en plak je klaslijst erin. Je leerlingen openen één klaslink (of QR),
            kiezen hun naam en zien meteen hun opdrachten. Hun resultaten komen via het
            <strong> inleverpunt</strong> bij jou terecht — zonder server, zonder account.
          </p>
          <button className="btn btn-primary" onClick={() => setNewOpen(true)}><AddIcon size={18} /> Eerste klas maken</button>
        </EmptyState>
      ) : (
        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {classes.map((cls) => {
            const opdrachten = assignmentsForClass(cls.id).length;
            const dubbel = duplicateStudentNames(cls.students);
            return (
              <div key={cls.id} className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{cls.name}</h2>
                <p className="hint" style={{ margin: 0 }}>
                  {cls.schoolYear ? `${cls.schoolYear} · ` : ''}
                  {cls.students.length} leerling{cls.students.length === 1 ? '' : 'en'} ·{' '}
                  {opdrachten} opdracht{opdrachten === 1 ? '' : 'en'}
                </p>
                {dubbel.length > 0 && (
                  <p className="hint" style={{ margin: 0 }}>
                    <WarningIcon size={14} className="icon-inline" />{' '}
                    {dubbel.length === 1
                      ? `“${dubbel[0]}” staat meer dan eens in de lijst.`
                      : `${dubbel.length} namen staan meer dan eens in de lijst: ${dubbel.join(', ')}.`}
                  </p>
                )}
                <p className="hint" style={{ margin: 0 }}>
                  Klascode <strong style={{ fontFamily: 'monospace', letterSpacing: '0.12em' }}>{cls.code}</strong>
                  {' · '}bijgewerkt {formatDateShort(cls.updatedAt)}
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 'auto', paddingTop: 8 }}>
                  <Link to={`/klas/${cls.id}`} className="btn btn-sm btn-primary"><ArrowRight size={16} /> Openen</Link>
                  <Link to={`/leerling/${cls.code}`} className="btn btn-sm btn-ghost"><StudentIcon size={16} /> Leerlingweergave</Link>
                  <button
                    className="btn btn-sm btn-quiet btn-icon"
                    aria-label={`Klas "${cls.name}" verwijderen`}
                    onClick={() => setDeleteTarget(cls)}
                  >
                    <DeleteIcon size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="hint" style={{ marginTop: 24 }}>
        <PrivacyIcon size={14} className="icon-inline" /> Klaslijsten blijven op dit toestel. Deel je een klaspakket, dan reist de lijst met namen
        mee in die link of dat bestand — geef ze dus alleen aan je eigen leerlingen.
      </p>

      {newOpen && (
        <NewClassModal
          onClose={() => setNewOpen(false)}
          onCreate={(cls) => {
            if (saveClass(cls)) {
              toast(`Klas "${cls.name}" aangemaakt`, 'ok');
              navigate(`/klas/${cls.id}`);
            }
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Klas verwijderen?"
          message={`"${deleteTarget.name}" en haar opdrachten worden verwijderd. De inzendingen en leesvoortgang van de leerlingen blijven bewaard (je vindt ze bij Resultaten).`}
          onConfirm={() => {
            deleteClass(deleteTarget.id);
            toast('Klas verwijderd', 'ok');
            setTick((t) => t + 1);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function NewClassModal({ onClose, onCreate }: { onClose: () => void; onCreate: (cls: ClassGroup) => void }) {
  const [name, setName] = useState('');
  const [year, setYear] = useState('');
  const [list, setList] = useState('');
  const students: ClassStudent[] = useMemo(() => parseStudentList(list), [list]);
  const dubbel = useMemo(() => duplicateNames(list), [list]);

  const submit = () => {
    if (!name.trim()) return;
    onCreate(createClass({ name, schoolYear: year, students }));
    onClose();
  };

  return (
    <Modal
      title="Nieuwe klas"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-primary" disabled={!name.trim()} onClick={submit}>Aanmaken</button>
        </>
      }
    >
      <Field label="Naam van de klas" hint="bv. 1A, 3 Latijn, of Wiskunde 2B">
        <input
          className="input"
          value={name}
          autoFocus
          placeholder="bv. 1A"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) submit(); }}
        />
      </Field>
      <Field label="Schooljaar (optioneel)">
        <input className="input" value={year} placeholder="bv. 2025-2026" onChange={(e) => setYear(e.target.value)} />
      </Field>
      <Field
        label="Klaslijst plakken (optioneel)"
        hint="Eén leerling per regel. Een klasnummer mag erbij: “12 Emma Peeters”, “Emma Peeters;12” of gewoon “Emma Peeters”."
      >
        <textarea
          className="textarea"
          rows={7}
          value={list}
          placeholder={'1 Emma Peeters\n2 Noah Claes\n3 Olivia Maes'}
          onChange={(e) => setList(e.target.value)}
        />
      </Field>
      <div role="status" style={{ marginTop: -6 }}>
        <p className="hint">
          {students.length === 0
            ? 'Nog geen leerlingen herkend — je kan ze ook later toevoegen.'
            : `${students.length} leerling${students.length === 1 ? '' : 'en'} herkend: ${students.slice(0, 4).map((s) => s.name).join(', ')}${students.length > 4 ? '…' : ''}`}
        </p>
        {dubbel.length > 0 && (
          <p className="hint">
            <WarningIcon size={14} className="icon-inline" /> {pastedDuplicatesMessage(dubbel)}. Geef twee leerlingen met dezelfde naam een eigen naam,
            bijvoorbeeld met een letter erachter.
          </p>
        )}
      </div>
    </Modal>
  );
}
