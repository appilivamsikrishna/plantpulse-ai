import { redirect } from 'next/navigation';

// /architecture now splits into two routes; send the bare path to the prototype view.
export default function ArchitectureIndex() {
  redirect('/architecture/prototype');
}
