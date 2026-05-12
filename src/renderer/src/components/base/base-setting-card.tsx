import React from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'

interface Props {
  title?: string
  children?: React.ReactNode
  className?: string
}

const SettingCard: React.FC<Props> = (props) => {
  return !props.title ? (
    <Card data-guide="settings-card" className={`${props.className} mx-2 mb-2`}>
      <CardContent>{props.children}</CardContent>
    </Card>
  ) : (
    <Accordion
      data-guide="settings-accordion"
      className={`${props.className} mx-2 mb-2 px-6 rounded-xl border text-card-foreground shadow-sm`}
      type="single"
      collapsible
      {...props}
    >
      <AccordionItem value={props.title}>
        <AccordionTrigger>{props.title}</AccordionTrigger>
        <AccordionContent>{props.children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export default SettingCard
