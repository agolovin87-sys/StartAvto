import { PddExamTicketsTab } from "@/components/PddExamTicketsTab";

export function InstructorTicketsTab() {
  return (
    <div className="admin-tab instructor-tickets-tab">
      <h1 className="admin-tab-title">Билеты</h1>
      <PddExamTicketsTab />
    </div>
  );
}
